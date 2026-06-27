import { ChartLineIcon, CubeIcon, DatabaseIcon, MapTrifoldIcon } from '@phosphor-icons/react'
import { panelRegistry } from '@/lib/layout/registry'
import MapPanel from './MapPanel'
import PlotPanel from './PlotPanel'
import RawDataPanel from './RawDataPanel'
import ScenePanel from './ScenePanel'

export function registerAllPanels() {
  panelRegistry.register({
    type: 'Scene',
    title: '3D Scene View',
    icon: CubeIcon,
    component: ScenePanel,
  })

  panelRegistry.register({
    type: 'Plot',
    title: 'Plot Diagnostics',
    icon: ChartLineIcon,
    component: PlotPanel,
  })

  panelRegistry.register({
    type: 'Map',
    title: 'Map Telemetry',
    icon: MapTrifoldIcon,
    component: MapPanel,
  })

  panelRegistry.register({
    type: 'RawData',
    title: 'Raw Message Inspector',
    icon: DatabaseIcon,
    component: RawDataPanel,
  })
}
