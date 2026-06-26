'use client'

import type { LayoutNode } from '@/lib/layout/types'
import React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useLayoutStore } from '@/lib/layout/store'
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

  const handleLayout = (sizes: number[]) => {
    updateSizes(node.id, sizes)
  }

  return (
    <PanelGroup
      direction={direction}
      onLayout={handleLayout}
      className="w-full h-full"
    >
      {node.children.map((child, idx) => {
        const defaultSize = node.sizes ? node.sizes[idx] : undefined
        return (
          <React.Fragment key={child.id}>
            <Panel defaultSize={defaultSize} minSize={15}>
              <div className="w-full h-full overflow-hidden">
                <LayoutRenderer node={child} />
              </div>
            </Panel>
            {idx < node.children.length - 1 && (
              <PanelResizeHandle />
            )}
          </React.Fragment>
        )
      })}
    </PanelGroup>
  )
}
