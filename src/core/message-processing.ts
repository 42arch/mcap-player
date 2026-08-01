export interface PointCloudMessageProcessor {
  type: 'point-cloud'
  maxPoints: number
}

export type MessageProcessor = PointCloudMessageProcessor
export type MessageProcessorByTopic = Record<string, MessageProcessor>
