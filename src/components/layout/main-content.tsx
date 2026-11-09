import { AlertCircle, Loader2 } from 'lucide-react'
import { globalPlaybackController } from '@/core/playback-controller'
import { useAnalytics } from '@/hooks/use-analytics'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import LandingView from './landing-view'
import PanelWorkspace from './panel-workspace'

interface MainContentProps {
  darkMode: boolean
}

export default function MainContent({ darkMode }: MainContentProps) {
  const { captureMcapOpened } = useAnalytics()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const isLoading = usePlayerStore(state => state.isLoading)
  const loadingMessage = usePlayerStore(state => state.loadingMessage)
  const error = usePlayerStore(state => state.error)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setError = usePlayerStore(state => state.setError)
  const resetPanels = usePanelStore(state => state.resetPanels)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    resetPanels()
    setIsLoading(true, 'Initializing decompression handlers...')
    captureMcapOpened({
      source: 'landing',
      method: 'local',
      fileSizeBytes: file.size,
    })
    try {
      await globalPlaybackController.loadFile(file)
    }
    catch (err: any) {
      console.error(err)
      globalPlaybackController.closeFile()
      setError(err.message || 'Failed to parse MCAP file')
    }
  }

  const handleRemoteUrlSubmit = async (url: string) => {
    resetPanels()
    setIsLoading(true, 'Reading remote MCAP indexes...')
    try {
      await globalPlaybackController.loadRemoteUrl(url)
    }
    catch (err: any) {
      console.error('Failed to load remote MCAP:', err)
      globalPlaybackController.closeFile()
      setError(err.message || 'Failed to load remote MCAP file')
    }
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-muted-foreground select-none">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-xs font-semibold text-foreground">{loadingMessage || 'Loading...'}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-55 text-center">
          Reading indexes and preparing metadata structures.
        </p>
      </div>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-destructive select-none">
        <AlertCircle className="w-8 h-8 text-destructive mb-3" />
        <p className="text-xs font-semibold">Error Loading MCAP</p>
        <p className="text-[10px] text-muted-foreground/80 mt-1 text-center max-w-xs select-text">
          {error}
        </p>
        <button
          onClick={() => setError(null)}
          className="mt-4 px-3 py-1 text-[10px] bg-secondary text-secondary-foreground hover:bg-accent border border-border rounded-md font-semibold cursor-pointer active:scale-95 transition-all"
        >
          Try Again
        </button>
      </div>
    )
  }

  // 3. Landing State (No File Loaded)
  if (!fileSummary) {
    return (
      <LandingView
        darkMode={darkMode}
        onFileChange={handleFileChange}
        onRemoteUrlSubmit={handleRemoteUrlSubmit}
      />
    )
  }

  // 4. File Loaded UI
  return (
    <div className="absolute inset-0 bg-background flex flex-col overflow-hidden text-foreground">
      <PanelWorkspace />
    </div>
  )
}
