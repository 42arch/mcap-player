'use client'

import { Cpu } from '@phosphor-icons/react'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ModeToggle } from '@/components/mode-toggle'

export default function TitleBar() {
  return (
    <header className="h-[35px] border-b border-layout-border bg-titlebar text-text-main px-3 flex items-center justify-between text-xs select-none w-full shrink-0 font-sans z-30">
      {/* Left side: Logo & Menu */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-bold text-layout-primary">
          <Cpu size={16} weight="fill" className="text-layout-primary" />
          <span className="tracking-tight text-[13px] font-bold text-text-main">MCAPVIEW</span>
        </div>
        <nav className="hidden md:flex items-center gap-2.5 text-text-secondary text-[11px] font-medium">
          {['File', 'Edit'].map(item => (
            <button key={item} className="hover:text-text-main px-1.5 py-0.5 rounded-[2px] hover:bg-layout-hover transition-colors cursor-pointer">
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: File/Workspace Name */}
      <div className="absolute left-1/2 transform -translate-x-1/2 text-text-secondary text-[11px] font-medium max-w-[30%] truncate">
        demo_robot_run.mcap - Workbench
      </div>

      {/* Right side: Actions & Switchers */}
      <div className="flex items-center gap-2">
        <div className="scale-85 origin-right flex items-center gap-1.5">
          <LanguageSwitcher />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
