export interface PointCloudMessageProcessor {
  type: 'point-cloud'
  maxPoints: number
  colorMode?: 'height' | 'intensity' | 'solid'
  solidColor?: string
}

export type MessageProcessor = PointCloudMessageProcessor
export type MessageProcessorByTopic = Record<string, MessageProcessor>
