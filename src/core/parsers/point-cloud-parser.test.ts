import { describe, expect, it } from 'vitest'
import {
  colorizePreparedPointCloud,
  PREPARED_POINT_CLOUD_FORMAT,
  preparePointCloud,
  renderPreparedPointCloud,
} from './point-cloud-parser'

function createPointCloudPayload() {
  const data = new Uint8Array(4 * 16)
  const view = new DataView(data.buffer)
  for (let index = 0; index < 4; index++) {
    const offset = index * 16
    view.setFloat32(offset, index, true)
    view.setFloat32(offset + 4, index * 2, true)
    view.setFloat32(offset + 8, index * 3, true)
    view.setFloat32(offset + 12, index * 10, true)
  }
  return {
    header: { frame_id: 'lidar' },
    point_step: 16,
    fields: [
      { name: 'x', offset: 0, datatype: 7 },
      { name: 'y', offset: 4, datatype: 7 },
      { name: 'z', offset: 8, datatype: 7 },
      { name: 'intensity', offset: 12, datatype: 7 },
    ],
    data,
  }
}

describe('point cloud preparation', () => {
  it('creates a compact transferable sample without retaining the raw payload buffer', () => {
    const payload = createPointCloudPayload()
    const prepared = preparePointCloud(payload, 2)

    expect(prepared).toMatchObject({
      format: PREPARED_POINT_CLOUD_FORMAT,
      frameId: 'lidar',
      pointCount: 2,
      minX: 0,
      maxX: 2,
      minIntensity: 0,
      maxIntensity: 20,
    })
    expect(Array.from(prepared!.positions)).toEqual([0, 0, 0, 2, 4, 6])
    expect(Array.from(prepared!.intensities!)).toEqual([0, 20])
    expect(prepared!.positions.buffer).not.toBe(payload.data.buffer)
  })

  it('recolors a prepared sample without needing the original PointCloud2 data', () => {
    const prepared = preparePointCloud(createPointCloudPayload(), 4)!
    const positions = new Float32Array(12)
    const colors = new Float32Array(12)
    const rendered = renderPreparedPointCloud(prepared, {
      colorMode: 'solid',
      solidColor: '#ff0000',
      maxPoints: 2,
    }, { positions, colors })

    expect(rendered?.pointCount).toBe(2)
    expect(Array.from(rendered!.positions)).toEqual([0, 0, 0, 2, 4, 6])
    expect(Array.from(rendered!.colors)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('uses worker-prepared colors without recomputing them on the render path', () => {
    const prepared = colorizePreparedPointCloud(
      preparePointCloud(createPointCloudPayload(), 4)!,
      'solid',
      '#00ff00',
    )
    const rendered = renderPreparedPointCloud(prepared, {
      colorMode: 'solid',
      solidColor: '#00ff00',
      maxPoints: 4,
    })

    expect(Array.from(rendered!.colors)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
  })
})
