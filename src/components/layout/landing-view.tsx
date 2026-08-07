import { FolderOpen, Globe } from 'lucide-react'
import { useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { OpenRemoteModal } from '@/components/modals/open-remote-modal'

interface LandingViewProps {
  darkMode: boolean
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function LandingView({ darkMode, onFileChange }: LandingViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [remoteModalOpen, setRemoteModalOpen] = useState(false)

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
            <FolderOpen className="size-7" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            <FormattedMessage id="landing.openFile" defaultMessage="Open MCAP File" />
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            <FormattedMessage id="landing.subtitle" defaultMessage="Drag & drop MCAP file here or click to browse" />
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            <FolderOpen className="size-4" />
            <FormattedMessage id="landing.chooseFile" defaultMessage="Choose File" />
          </button>
          <button
            onClick={() => setRemoteModalOpen(true)}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-2 border border-border"
          >
            <Globe className="size-4 text-primary" />
            <FormattedMessage id="landing.openUrl" defaultMessage="Open Remote URL" />
          </button>
        </div>

        <div className="pt-2 text-[10px] text-muted-foreground/60 border-t border-border/50">
          Supports Standard MCAP files (uncompressed, Zstd, or LZ4) over HTTP/HTTPS Range Requests
        </div>
      </div>

      <OpenRemoteModal
        open={remoteModalOpen}
        onOpenChange={setRemoteModalOpen}
      />
    </div>
  )
}
