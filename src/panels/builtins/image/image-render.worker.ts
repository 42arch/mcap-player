import type { ImageRendererCommand, ImageRendererEvent, ImageRenderFrame } from './image-render-protocol'
import { processH264Frame } from '@/core/parsers/h264'
import {
  selectLatestCompleteH264Gop,
  VIDEO_DECODER_HIGH_WATER,
  VIDEO_OUTPUT_DEADLINE_US,
} from './h264-backpressure'

interface H264Frame extends ImageRenderFrame {
  bytes: Uint8Array
  spsPps: Uint8Array | null
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<ImageRendererCommand>) => void) | null
  postMessage: (message: ImageRendererEvent, transfer?: Transferable[]) => void
  close: () => void
}

const scope = globalThis as unknown as WorkerScope
const RENDER_INTERVAL_MS = 1000 / 60
const PRESSURED_RENDER_INTERVAL_MS = 1000 / 30

let generation = 0
let canvas: OffscreenCanvas | null = null
let context: OffscreenCanvasRenderingContext2D | null = null
let rgbaBuffer: Uint8ClampedArray | null = null
let imageData: ImageData | null = null
let pendingLatest: ImageRenderFrame | null = null
let isRenderingLatest = false
let latestRequestedTimestampUs = Number.NEGATIVE_INFINITY
let h264Queue: H264Frame[] = []
let decoder: VideoDecoder | null = null
let decoderEpoch = 0
let hasSeenKeyframe = false
let cachedSpsPps: Uint8Array | null = null
let latestInputTimestampUs = 0
let pendingDecodedFrame: VideoFrame | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let lastRenderTimeMs = 0

function post(message: ImageRendererEvent, transfer?: Transferable[]) {
  scope.postMessage(message, transfer)
}

function postError(message: string) {
  post({ type: 'error', generation, message })
}

function ensureContext(width: number, height: number): OffscreenCanvasRenderingContext2D | null {
  if (!canvas) {
    if (typeof OffscreenCanvas === 'undefined') {
      postError('OffscreenCanvas is not supported in this browser.')
      return null
    }
    canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
    context = canvas.getContext('2d', { alpha: false })
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    context = canvas.getContext('2d', { alpha: false })
    rgbaBuffer = null
    imageData = null
  }
  return context
}

function publishCanvas(frameGeneration: number) {
  if (!canvas || frameGeneration !== generation) {
    return
  }
  const bitmap = canvas.transferToImageBitmap()
  post({ type: 'rendered', generation: frameGeneration, bitmap }, [bitmap])
}

function getCompressedImageMimeType(format?: string): string {
  const normalized = String(format || '').toLowerCase()
  if (normalized.includes('png')) {
    return 'image/png'
  }
  if (normalized.includes('webp')) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

async function renderCompressed(frame: ImageRenderFrame) {
  const bitmap = await createImageBitmap(new Blob([frame.data], { type: getCompressedImageMimeType(frame.format) }))
  try {
    if (frame.generation !== generation) {
      return
    }
    if (frame.timestampUs !== latestRequestedTimestampUs) {
      return
    }
    const ctx = ensureContext(bitmap.width, bitmap.height)
    if (!ctx) {
      return
    }
    ctx.drawImage(bitmap, 0, 0)
    publishCanvas(frame.generation)
  }
  finally {
    bitmap.close()
  }
}

function renderRaw(frame: ImageRenderFrame) {
  const width = Math.max(0, Math.trunc(frame.width || 0))
  const height = Math.max(0, Math.trunc(frame.height || 0))
  if (width === 0 || height === 0) {
    return
  }
  const ctx = ensureContext(width, height)
  if (!ctx) {
    return
  }

  const requiredLength = width * height * 4
  if (!rgbaBuffer || rgbaBuffer.length !== requiredLength || !imageData) {
    imageData = ctx.createImageData(width, height)
    rgbaBuffer = imageData.data
  }
  const rgba = rgbaBuffer
  const source = new Uint8Array(frame.data)
  const encoding = String(frame.encoding || '').toLowerCase()
  const channels = encoding === 'mono8'
    ? 1
    : encoding.includes('rgba') || encoding.includes('bgra') ? 4 : 3
  const rowStep = Math.max(width * channels, Math.trunc(frame.step || 0))

  for (let y = 0; y < height; y++) {
    let sourceIndex = y * rowStep
    let targetIndex = y * width * 4
    for (let x = 0; x < width; x++, targetIndex += 4) {
      if (encoding === 'mono8') {
        const value = source[sourceIndex++] || 0
        rgba[targetIndex] = value
        rgba[targetIndex + 1] = value
        rgba[targetIndex + 2] = value
        rgba[targetIndex + 3] = 255
      }
      else if (encoding === 'bgr8') {
        rgba[targetIndex] = source[sourceIndex + 2] || 0
        rgba[targetIndex + 1] = source[sourceIndex + 1] || 0
        rgba[targetIndex + 2] = source[sourceIndex] || 0
        rgba[targetIndex + 3] = 255
        sourceIndex += 3
      }
      else if (encoding === 'bgra8' || encoding === 'bgra') {
        rgba[targetIndex] = source[sourceIndex + 2] || 0
        rgba[targetIndex + 1] = source[sourceIndex + 1] || 0
        rgba[targetIndex + 2] = source[sourceIndex] || 0
        rgba[targetIndex + 3] = source[sourceIndex + 3] ?? 255
        sourceIndex += 4
      }
      else if (encoding === 'rgba8' || encoding === 'rgba') {
        rgba[targetIndex] = source[sourceIndex] || 0
        rgba[targetIndex + 1] = source[sourceIndex + 1] || 0
        rgba[targetIndex + 2] = source[sourceIndex + 2] || 0
        rgba[targetIndex + 3] = source[sourceIndex + 3] ?? 255
        sourceIndex += 4
      }
      else {
        rgba[targetIndex] = source[sourceIndex] || 0
        rgba[targetIndex + 1] = source[sourceIndex + 1] || 0
        rgba[targetIndex + 2] = source[sourceIndex + 2] || 0
        rgba[targetIndex + 3] = 255
        sourceIndex += 3
      }
    }
  }
  ctx.putImageData(imageData, 0, 0)
  publishCanvas(frame.generation)
}

async function processLatestFrames() {
  if (isRenderingLatest) {
    return
  }
  isRenderingLatest = true
  try {
    while (pendingLatest) {
      const frame = pendingLatest
      pendingLatest = null
      if (frame.generation !== generation) {
        continue
      }
      if (frame.format !== undefined) {
        await renderCompressed(frame)
      }
      else {
        renderRaw(frame)
      }
    }
  }
  catch (error) {
    postError(error instanceof Error ? error.message : 'Failed to render image frame.')
  }
  finally {
    isRenderingLatest = false
  }
}

function closeDecoder() {
  decoderEpoch++
  if (decoder && decoder.state !== 'closed') {
    try {
      decoder.close()
    }
    catch {}
  }
  decoder = null
  hasSeenKeyframe = false
}

function renderDecodedFrame() {
  renderTimer = null
  const frame = pendingDecodedFrame
  pendingDecodedFrame = null
  if (!frame) {
    return
  }
  try {
    const ctx = ensureContext(frame.displayWidth, frame.displayHeight)
    if (!ctx) {
      return
    }
    ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight)
    lastRenderTimeMs = performance.now()
    publishCanvas(generation)
  }
  finally {
    frame.close()
  }
}

function scheduleDecodedFrame() {
  if (renderTimer !== null) {
    return
  }
  const pressured = h264Queue.length >= 30 || (decoder?.decodeQueueSize || 0) >= VIDEO_DECODER_HIGH_WATER
  const interval = pressured ? PRESSURED_RENDER_INTERVAL_MS : RENDER_INTERVAL_MS
  const delay = Math.max(0, interval - (performance.now() - lastRenderTimeMs))
  renderTimer = setTimeout(renderDecodedFrame, delay)
}

function handleDecodedFrame(frame: VideoFrame, epoch: number) {
  if (epoch !== decoderEpoch || frame.timestamp < latestInputTimestampUs - VIDEO_OUTPUT_DEADLINE_US) {
    frame.close()
    return
  }
  pendingDecodedFrame?.close()
  pendingDecodedFrame = frame
  scheduleDecodedFrame()
  feedDecoder()
}

function ensureDecoder(): VideoDecoder | null {
  if (decoder && decoder.state !== 'closed') {
    return decoder
  }
  if (typeof VideoDecoder === 'undefined') {
    postError('WebCodecs VideoDecoder is not supported in this browser.')
    return null
  }
  const epoch = ++decoderEpoch
  try {
    const nextDecoder = new VideoDecoder({
      output: frame => handleDecodedFrame(frame, epoch),
      error: (error) => {
        if (epoch === decoderEpoch) {
          postError(`VideoDecoder error: ${error.message}`)
          closeDecoder()
        }
      },
    })
    nextDecoder.configure({ codec: 'avc1.42E01E', optimizeForLatency: true })
    nextDecoder.addEventListener('dequeue', feedDecoder)
    decoder = nextDecoder
    return nextDecoder
  }
  catch (error) {
    postError(error instanceof Error ? error.message : 'Failed to initialize VideoDecoder.')
    closeDecoder()
    return null
  }
}

function feedDecoder() {
  const activeDecoder = ensureDecoder()
  if (!activeDecoder || activeDecoder.state !== 'configured') {
    return
  }
  while (h264Queue.length > 0 && activeDecoder.decodeQueueSize < VIDEO_DECODER_HIGH_WATER) {
    const frame = h264Queue.shift()!
    if (frame.generation !== generation) {
      continue
    }
    if (!hasSeenKeyframe && !frame.isKeyframe) {
      continue
    }

    let bytes = frame.bytes
    if (frame.spsPps) {
      cachedSpsPps = frame.spsPps
    }
    if (!hasSeenKeyframe) {
      hasSeenKeyframe = true
      if (!frame.spsPps && cachedSpsPps) {
        const combined = new Uint8Array(cachedSpsPps.length + bytes.length)
        combined.set(cachedSpsPps)
        combined.set(bytes, cachedSpsPps.length)
        bytes = combined
      }
    }

    try {
      activeDecoder.decode(new EncodedVideoChunk({
        type: frame.isKeyframe ? 'key' : 'delta',
        timestamp: frame.timestampUs,
        data: bytes,
      }))
    }
    catch (error) {
      postError(error instanceof Error ? error.message : 'Failed to decode H264 frame.')
      closeDecoder()
      break
    }
  }
}

function enqueueH264(frame: ImageRenderFrame) {
  const parsed = processH264Frame(new Uint8Array(frame.data))
  latestInputTimestampUs = Math.max(latestInputTimestampUs, frame.timestampUs)
  const queuedFrame: H264Frame = {
    ...frame,
    isKeyframe: frame.isKeyframe || parsed.isKeyframe,
    bytes: parsed.bytes,
    spsPps: parsed.spsPps,
  }
  const nextQueue = selectLatestCompleteH264Gop([...h264Queue, queuedFrame])
  if (nextQueue.length < h264Queue.length + 1) {
    closeDecoder()
    pendingDecodedFrame?.close()
    pendingDecodedFrame = null
    h264Queue = nextQueue
  }
  else {
    h264Queue = nextQueue
  }
  feedDecoder()
}

function reset(nextGeneration: number) {
  generation = nextGeneration
  pendingLatest = null
  h264Queue = []
  latestInputTimestampUs = 0
  latestRequestedTimestampUs = Number.NEGATIVE_INFINITY
  cachedSpsPps = null
  closeDecoder()
  pendingDecodedFrame?.close()
  pendingDecodedFrame = null
  if (renderTimer !== null) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
}

scope.onmessage = (event) => {
  const command = event.data
  if (command.type === 'dispose') {
    reset(generation + 1)
    canvas = null
    context = null
    scope.close()
    return
  }
  if (command.type === 'reset') {
    reset(command.generation)
    return
  }

  const frame = command.frame
  post({ type: 'accepted', generation: frame.generation })
  if (frame.generation !== generation) {
    return
  }
  if (frame.isH264) {
    enqueueH264(frame)
  }
  else {
    latestRequestedTimestampUs = frame.timestampUs
    pendingLatest = frame
    void processLatestFrames()
  }
}
