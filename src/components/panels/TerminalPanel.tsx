'use client'

import { Terminal } from '@phosphor-icons/react'
import React from 'react'

export default function TerminalPanel() {
  const logs = [
    { time: '16:15:30.102', level: 'info', sender: 'rosout', msg: 'ROS 2 node /mcap_player started successfully.' },
    { time: '16:15:30.120', level: 'info', sender: 'mcap', msg: 'Opening recording file demo_robot_run.mcap' },
    { time: '16:15:30.405', level: 'info', sender: 'mcap', msg: 'Successfully parsed MCAP header. Found 12 topics.' },
    { time: '16:15:31.002', level: 'warning', sender: 'controller', msg: 'Control loop execution time exceeded budget! Expected <10ms, got 14.5ms.' },
    { time: '16:15:31.500', level: 'info', sender: 'lidar_driver', msg: 'Lidar calibration completed successfully.' },
    { time: '16:15:32.180', level: 'error', sender: 'path_planner', msg: 'No valid path found to target goal (x: 180.0, y: 80.0). Path blocked by obstacle.' },
    { time: '16:15:32.182', level: 'info', sender: 'behavior_tree', msg: 'State transition: NAVIGATION -> RECOVERY_MOVE_BACK' },
  ]

  return (
    <div className="w-full h-full bg-[#1E1E1E] text-[#D4D4D4] font-mono text-xs select-text overflow-y-auto leading-relaxed p-3">
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#2D2D2D] text-[#808080] text-[10px]">
        <Terminal size={12} />
        <span>mcapview console output logs</span>
      </div>

      <div className="space-y-1">
        {logs.map((log, idx) => (
          <div key={idx} className="flex gap-2 hover:bg-[#2A2D2E]/40 px-1 py-0.5 rounded-[1px]">
            <span className="text-[#808080] select-none">{log.time}</span>

            <span className={`font-semibold uppercase text-[10px] px-1 rounded-[1px] select-none h-fit self-center ${
              log.level === 'info'
                ? 'bg-[#0E639C]/20 text-[#0E639C] dark:text-[#58A6FF]'
                : log.level === 'warning'
                  ? 'bg-[#D29922]/20 text-[#D29922]'
                  : 'bg-[#F85149]/20 text-[#F85149]'
            }`}
            >
              {log.level}
            </span>

            <span className="text-[#58A6FF] select-none">
              [
              {log.sender}
              ]
            </span>
            <span className={
              log.level === 'error'
                ? 'text-[#F85149]'
                : log.level === 'warning'
                  ? 'text-[#D29922]'
                  : 'text-[#CCCCCC]'
            }
            >
              {log.msg}
            </span>
          </div>
        ))}

        {/* Mock terminal line input */}
        <div className="flex gap-2 items-center text-zinc-500 pt-2 select-none">
          <span>$</span>
          <span className="animate-pulse bg-zinc-400 w-1.5 h-3.5 inline-block"></span>
        </div>
      </div>
    </div>
  )
}
