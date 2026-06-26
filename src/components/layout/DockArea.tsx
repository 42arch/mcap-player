'use client'

import React from 'react'
import { useLayoutStore } from '@/lib/layout/store'
import LayoutRenderer from './LayoutRenderer'

export default function DockArea() {
  const layoutTree = useLayoutStore(state => state.layoutTree)

  return (
    <div className="w-full h-full min-h-0 relative overflow-hidden bg-workbench">
      {layoutTree
        ? (
            <LayoutRenderer node={layoutTree} />
          )
        : (
            <div className="w-full h-full flex items-center justify-center text-text-secondary text-xs select-none">
              No panels open. Click split in active tab or reset layout.
            </div>
          )}
    </div>
  )
}
