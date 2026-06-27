import type { LayoutNode } from '@/lib/layout/types'
import { Fragment } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useLayoutStore } from '@/stores/layout'
import PanelWrapper from './PanelWrapper'

interface LayoutRendererProps {
  node: LayoutNode
}

export default function LayoutRenderer({ node }: LayoutRendererProps) {
  const updateSizes = useLayoutStore(state => state.updateSizes)

  if (node.type === 'panel') {
    return <PanelWrapper node={node} />
  }

  const direction = node.direction

  const handleLayout = (layout: Record<string, number>) => {
    const sizes = node.children.map(child => layout[child.id] ?? 0)
    updateSizes(node.id, sizes)
  }

  return (
    <ResizablePanelGroup
      orientation={direction}
      onLayoutChange={handleLayout}
      className="w-full h-full"
    >
      {node.children.map((child, idx) => {
        const defaultSize = node.sizes ? node.sizes[idx] : undefined
        return (
          <Fragment key={child.id}>
            <ResizablePanel defaultSize={defaultSize !== undefined ? `${defaultSize}%` : undefined} minSize="15%" id={child.id}>
              <div className="w-full h-full overflow-hidden">
                <LayoutRenderer node={child} />
              </div>
            </ResizablePanel>
            {idx < node.children.length - 1 && (
              <ResizableHandle />
            )}
          </Fragment>
        )
      })}
    </ResizablePanelGroup>
  )
}
