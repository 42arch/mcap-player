import type { DecodedMessage } from './message-cursor'

export function normalizeFrameId(frameId: unknown): string {
  return typeof frameId === 'string' ? frameId.replace(/^\/+/, '') : ''
}

export function extractTransforms(payload: any): Array<{ parentFrameId: string, childFrameId: string }> {
  if (!payload) {
    return []
  }
  if (payload.parent_frame_id || payload.parentFrameId) {
    return [{
      parentFrameId: payload.parent_frame_id || payload.parentFrameId,
      childFrameId: payload.child_frame_id || payload.childFrameId,
    }]
  }
  if (!Array.isArray(payload.transforms)) {
    return []
  }
  return payload.transforms.map((transform: any) => ({
    parentFrameId: transform?.header?.frame_id || transform?.header?.frameId || transform?.parent_frame_id || transform?.parentFrameId,
    childFrameId: transform?.child_frame_id || transform?.childFrameId,
  }))
}

export function getSingleTransformChildFrame(payload: any): string {
  const value = payload?.child_frame_id || payload?.childFrameId
  return typeof value === 'string' ? value : ''
}

export function getBatchTransformChildFrame(transform: any): string {
  const value = transform?.child_frame_id || transform?.childFrameId
  return typeof value === 'string' ? value : ''
}

export class TransformUpdateState {
  private transformsByChild = new Map<string, any>()
  private batchTemplate: any = null
  private usesBatchPayload = false

  clone(): TransformUpdateState {
    const clone = new TransformUpdateState()
    clone.transformsByChild = new Map(this.transformsByChild)
    clone.batchTemplate = this.batchTemplate
    clone.usesBatchPayload = this.usesBatchPayload
    return clone
  }

  apply(payload: any): void {
    const singleChild = getSingleTransformChildFrame(payload)
    if (singleChild) {
      this.transformsByChild.set(singleChild, payload)
      return
    }
    if (!Array.isArray(payload?.transforms)) {
      return
    }
    this.usesBatchPayload = true
    this.batchTemplate = payload
    for (const transform of payload.transforms) {
      const child = getBatchTransformChildFrame(transform)
      if (child) {
        this.transformsByChild.set(child, transform)
      }
    }
  }

  toSnapshotMessages(lastMessage: DecodedMessage, seekTimeNs: bigint): DecodedMessage[] {
    if (this.usesBatchPayload) {
      return [{
        ...lastMessage,
        logTime: seekTimeNs,
        publishTime: seekTimeNs,
        dataLength: 0,
        payload: {
          ...this.batchTemplate,
          transforms: Array.from(this.transformsByChild.values()),
        },
      }]
    }

    const transforms = Array.from(this.transformsByChild.values())
    if (transforms.length === 0) {
      return [{
        ...lastMessage,
        logTime: seekTimeNs,
        publishTime: seekTimeNs,
        dataLength: 0,
      }]
    }
    return transforms.map((payload, index) => ({
      ...lastMessage,
      logTime: seekTimeNs,
      publishTime: seekTimeNs,
      sequence: lastMessage.sequence + index,
      dataLength: 0,
      payload,
    }))
  }
}
