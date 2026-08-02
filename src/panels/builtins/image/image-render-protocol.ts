export interface ImageRenderFrame {
  generation: number
  timestampUs: number
  format?: string
  width?: number
  height?: number
  encoding?: string
  step?: number
  isH264: boolean
  isKeyframe: boolean
  data: ArrayBuffer
}

export type ImageRendererCommand
  = | { type: 'frame', frame: ImageRenderFrame }
    | { type: 'reset', generation: number }
    | { type: 'dispose' }

export type ImageRendererEvent
  = | { type: 'accepted', generation: number }
    | { type: 'rendered', generation: number, bitmap: ImageBitmap }
    | { type: 'error', generation: number, message: string }
