import type { IntlShape } from 'react-intl'
import { RemoteMcapSourceError } from '@/core/sources/mcap-source'

const errorMessages = {
  required: { id: 'landing.remoteRequired', defaultMessage: 'Enter a remote MCAP URL.' },
  invalid: { id: 'landing.remoteInvalid', defaultMessage: 'Enter a valid HTTP or HTTPS URL.' },
  protocol: { id: 'landing.remoteProtocol', defaultMessage: 'Remote MCAP URLs must use HTTP or HTTPS.' },
  extension: { id: 'landing.remoteUnsupported', defaultMessage: 'The remote URL must point to an .mcap file.' },
} as const

export function formatRemoteUrlError(error: unknown, formatMessage: IntlShape['formatMessage']): string {
  if (error instanceof RemoteMcapSourceError) {
    return formatMessage(errorMessages[error.code])
  }
  return formatMessage(errorMessages.invalid)
}
