import { ArrowsClockwiseIcon, CameraIcon, CubeIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export default function ScenePanel() {
  return (
    <div className="w-full h-full bg-[#1E1E1E] text-[#CCCCCC] flex flex-col relative font-mono select-none overflow-hidden text-xs">
      {/* 3D Viewport Controls Overlay */}
      <div className="absolute top-2 left-2 flex gap-1 z-10">
        <Button variant="outline" size="xs" className="bg-[#2D2D2D]/80 border border-[#3C3C3C] text-white hover:bg-[#3C3C3C] px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors">
          <CameraIcon size={14} />
          <span>Persp</span>
        </Button>
        <Button variant="outline" size="xs" className="bg-[#2D2D2D]/80 border border-[#3C3C3C] text-white hover:bg-[#3C3C3C] px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors">
          <VideoCameraIcon size={14} />
          <span>Camera 1</span>
        </Button>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <Button variant="outline" size="icon-xs" className="bg-[#2D2D2D]/80 border border-[#3C3C3C] text-white hover:bg-[#3C3C3C] cursor-pointer transition-colors" title="Reset View">
          <ArrowsClockwiseIcon size={14} />
        </Button>
      </div>

      {/* Mock 3D Canvas Area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-radial from-[#252526] to-[#151515]">
        {/* Isometric Grid Floor */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #555555 1px, transparent 1px),
              linear-gradient(-45deg, #555555 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            backgroundPosition: 'center',
            transform: 'perspective(500px) rotateX(60deg) translateY(50px) translateZ(-50px)',
          }}
        />

        {/* Mock Robot Object */}
        <div className="relative flex flex-col items-center justify-center animate-pulse duration-[3000ms]">
          <div className="w-16 h-16 border-2 border-[#1677FF] bg-[#1677FF]/10 flex items-center justify-center rounded-lg shadow-[0_0_15px_rgba(22,119,255,0.3)]">
            <CubeIcon size={32} className="text-[#1677FF]" weight="duotone" />
          </div>
          {/* Coord Axes */}
          <div className="absolute bottom-[-10px] left-1/2 w-12 h-[2px] bg-red-500 origin-left transform rotate-0" title="X-Axis"></div>
          <div className="absolute bottom-[-10px] left-1/2 w-12 h-[2px] bg-green-500 origin-left transform -rotate-90" title="Y-Axis"></div>
          <div className="absolute bottom-[-10px] left-1/2 w-12 h-[2px] bg-blue-500 origin-left transform rotate-180" title="Z-Axis"></div>

          <div className="mt-4 text-[10px] text-zinc-500 text-center">
            <div>AGV-01 (ACTIVE)</div>
            <div>x: 12.34 y: -5.67 z: 0.12</div>
          </div>
        </div>

        {/* Viewport Info Overlay */}
        <div className="absolute bottom-2 left-2 text-[10px] text-zinc-500 leading-normal">
          <div>FPS: 60.0</div>
          <div>Points: 128,409</div>
          <div>Latency: 12ms</div>
        </div>
      </div>
    </div>
  )
}
