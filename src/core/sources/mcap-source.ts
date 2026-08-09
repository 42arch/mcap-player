export interface LocalMcapSource {
  kind: 'local'
  file: File
}

export interface RemoteMcapSource {
  kind: 'remote'
  url: string
  name: string
  knownSize?: number
}

export type McapSource = LocalMcapSource | RemoteMcapSource
export type RemoteMcapSourceErrorCode = 'required' | 'invalid' | 'protocol' | 'extension'

export class RemoteMcapSourceError extends Error {
  constructor(public readonly code: RemoteMcapSourceErrorCode, message: string) {
    super(message)
    this.name = 'RemoteMcapSourceError'
  }
}

const MCAP_PATH_PATTERN = /\.mcap$/i

export function createRemoteMcapSource(rawUrl: string): RemoteMcapSource {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new RemoteMcapSourceError('required', 'Enter a remote MCAP URL.')
  }

  let url: URL
  try {
    url = new URL(trimmed)
  }
  catch {
    throw new RemoteMcapSourceError('invalid', 'Enter a valid HTTP or HTTPS URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RemoteMcapSourceError('protocol', 'Remote MCAP URLs must use HTTP or HTTPS.')
  }
  if (!MCAP_PATH_PATTERN.test(url.pathname)) {
    throw new RemoteMcapSourceError('extension', 'The remote URL must point to an .mcap file.')
  }

  const pathName = url.pathname.split('/').filter(Boolean).at(-1) ?? 'remote.mcap'
  let name = pathName
  try {
    name = decodeURIComponent(pathName)
  }
  catch {
    // Keep the encoded pathname when it contains malformed escape sequences.
  }

  return {
    kind: 'remote',
    url: url.toString(),
    name,
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
