import { ChartLine, Cube, Info, MapTrifold, Terminal } from '@phosphor-icons/react'
import { panelRegistry } from '@/lib/layout/registry'
import InspectorPanel from './InspectorPanel'
import MapPanel from './MapPanel'
import PlotPanel from './PlotPanel'
import ScenePanel from './ScenePanel'
import TerminalPanel from './TerminalPanel'

export function registerAllPanels() {
  panelRegistry.register({
    type: 'Scene',
    title: '3D Scene View',
    icon: Cube,
    component: ScenePanel,
  })

  panelRegistry.register({
    type: 'Plot',
    title: 'Plot Diagnostics',
    icon: ChartLine,
    component: PlotPanel,
  })

  panelRegistry.register({
    type: 'Map',
    title: 'Map Telemetry',
    icon: MapTrifold,
    component: MapPanel,
  })

  panelRegistry.register({
    type: 'Inspector',
    title: 'Property Inspector',
    icon: Info,
    component: InspectorPanel,
  })

  panelRegistry.register({
    type: 'Terminal',
    title: 'Console Terminal',
    icon: Terminal,
    component: TerminalPanel,
  })
}
