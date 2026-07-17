import { FolderOpen } from 'lucide-react'
import { useRef } from 'react'

interface LandingViewProps {
  darkMode: boolean
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function LandingView({ darkMode, onFileChange }: LandingViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6"
      style={{
        backgroundImage: darkMode
          ? 'radial-gradient(circle, #333333 1px, transparent 1px)'
          : 'radial-gradient(circle, #e0e0e0 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept=".mcap"
        className="hidden"
      />

      <div className="max-w-md w-full text-center space-y-6 p-8 bg-card/60 backdrop-blur-md rounded-2xl border border-border/80 shadow-lg">
        <div className="space-y-2">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 text-primary mb-2 shadow-inner">
            <FolderOpen className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Open MCAP Log File</h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Select or drop a local MCAP log file. The analyzer will perform a full scan of channels, schemas, and decode messages to verify contents.
          </p>
        </div>

        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-2 mx-auto"
          >
            <FolderOpen className="w-4 h-4" />
            Choose File
          </button>
        </div>

        <div className="pt-2 text-[10px] text-muted-foreground/60 border-t border-border/50">
          Supports Standard MCAP files (uncompressed, Zstd, or LZ4)
        </div>
      </div>
    </div>
  )
}
