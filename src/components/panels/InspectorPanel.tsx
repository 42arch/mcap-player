'use client'

import { Database, FileCode, Info } from '@phosphor-icons/react'
import React from 'react'

export default function InspectorPanel() {
  const metadata = [
    { category: 'General', items: [
      { key: 'Active Topic', value: '/pose_estimation/pose' },
      { key: 'Message Type', value: 'geometry_msgs/PoseStamped' },
      { key: 'Frame ID', value: 'map' },
      { key: 'Frequency', value: '30.0 Hz' },
    ] },
    { category: 'Pose Data', items: [
      { key: 'Position.X', value: '12.3456 m' },
      { key: 'Position.Y', value: '-5.6789 m' },
      { key: 'Position.Z', value: '0.1234 m' },
      { key: 'Orientation.W', value: '0.9238' },
      { key: 'Orientation.X', value: '0.0000' },
      { key: 'Orientation.Y', value: '0.0000' },
      { key: 'Orientation.Z', value: '0.3826' },
    ] },
    { category: 'MCAP Source', items: [
      { key: 'File Path', value: 'demo_robot_run.mcap' },
      { key: 'Total Duration', value: '124.5s' },
      { key: 'Compression', value: 'lz4' },
      { key: 'Chunks', value: '18' },
    ] },
  ]

  return (
    <div className="w-full h-full bg-panel text-text-main flex flex-col font-mono text-xs overflow-y-auto select-text select-none">
      <div className="flex-1">
        {metadata.map((sec, sidx) => (
          <div key={sec.category} className={sidx > 0 ? 'border-t border-layout-border' : ''}>
            <div className="bg-titlebar/80 px-3 py-1.5 text-[10px] text-text-secondary uppercase tracking-wider font-bold border-b border-layout-border/30 flex items-center gap-1.5">
              {sec.category === 'General' && <Info size={11} />}
              {sec.category === 'Pose Data' && <FileCode size={11} />}
              {sec.category === 'MCAP Source' && <Database size={11} />}
              <span>{sec.category}</span>
            </div>
            <table className="w-full table-fixed divide-y divide-layout-border/30">
              <tbody className="divide-y divide-layout-border/20">
                {sec.items.map(item => (
                  <tr key={item.key} className="hover:bg-layout-hover/50 transition-colors">
                    <td className="w-2/5 px-3 py-1.5 text-text-secondary border-r border-layout-border/20 text-[11px] truncate" title={item.key}>
                      {item.key}
                    </td>
                    <td className="w-3/5 px-3 py-1.5 text-text-main text-[11px] font-semibold truncate" title={item.value}>
                      {item.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
