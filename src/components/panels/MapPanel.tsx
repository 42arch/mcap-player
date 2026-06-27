import { MapPinIcon, MinusIcon, NavigationArrowIcon, PlusIcon, TargetIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export default function MapPanel() {
  return (
    <div className="w-full h-full bg-panel text-text-main flex flex-col font-mono text-xs overflow-hidden relative select-none">
      {/* Map Control Bar */}
      <div className="absolute top-2 left-2 flex gap-1 z-10">
        <Button variant="outline" size="icon-xs" className="bg-panel border border-layout-border text-text-main hover:bg-layout-hover cursor-pointer" title="Center on Robot">
          <TargetIcon size={13} />
        </Button>
        <Button variant="outline" size="icon-xs" className="bg-panel border border-layout-border text-text-main hover:bg-layout-hover cursor-pointer" title="Add Waypoint">
          <MapPinIcon size={13} />
        </Button>
      </div>

      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <Button variant="outline" size="icon-xs" className="bg-panel border border-layout-border text-text-main hover:bg-layout-hover cursor-pointer">
          <PlusIcon size={13} />
        </Button>
        <Button variant="outline" size="icon-xs" className="bg-panel border border-layout-border text-text-main hover:bg-layout-hover cursor-pointer">
          <MinusIcon size={13} />
        </Button>
      </div>

      {/* Grid Canvas Area */}
      <div className="flex-1 bg-[#FAFAFA] dark:bg-[#18181C] flex items-center justify-center relative overflow-hidden">
        {/* Fine grid */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--divider-color) 1px, transparent 1px),
              linear-gradient(to bottom, var(--divider-color) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: 'center',
          }}
        />
        {/* Major grid */}
        <div
          className="absolute inset-0 opacity-80 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--border-color) 1px, transparent 1px),
              linear-gradient(to bottom, var(--border-color) 1px, transparent 1px)
            `,
            backgroundSize: '100px 100px',
            backgroundPosition: 'center',
          }}
        />

        {/* Center axes indicator */}
        <div className="absolute w-[2px] h-20 bg-red-500/20 pointer-events-none"></div>
        <div className="absolute h-[2px] w-20 bg-green-500/20 pointer-events-none"></div>

        {/* Map Coordinates labels */}
        <div className="absolute bottom-2 right-2 bg-panel/80 px-1 py-0.5 border border-layout-border text-[9px] text-text-secondary rounded-[1px]">
          Scale: 1m | Grid: 0.2m
        </div>

        {/* Trajectory SVG Path */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <path
            d="M 150,150 Q 200,100 250,180 T 350,220"
            fill="none"
            stroke="var(--primary-color)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        </svg>

        {/* Robot Indicator Icon on Map */}
        <div
          className="absolute flex items-center justify-center bg-layout-active border border-layout-primary text-layout-primary w-6 h-6 rounded-full shadow-[0_0_8px_rgba(22,119,255,0.2)]"
          style={{ transform: 'translate(100px, 45px) rotate(45deg)' }}
        >
          <NavigationArrowIcon size={12} weight="fill" className="transform -rotate-45" />
        </div>

        {/* Mock Obstacles/Waypoints */}
        <div className="absolute w-2 h-2 bg-red-500 rounded-full" style={{ transform: 'translate(-50px, -30px)' }} title="Obstacle"></div>
        <div className="absolute w-2 h-2 bg-green-500 rounded-full" style={{ transform: 'translate(180px, 80px)' }} title="Goal Target"></div>
      </div>
    </div>
  )
}
