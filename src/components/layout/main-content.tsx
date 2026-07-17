import { AlertCircle, ChevronDown, FileCode, LayoutGrid, Loader2 } from 'lucide-react'
import OverviewPanel from '@/components/panels/overview-panel'
import RawMessagePanel from '@/components/panels/raw-message-panel'
import ImagePanel from '@/components/panels/image-panel'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePlayerStore } from '@/stores/use-player-store'
import LandingView from './landing-view'

interface MainContentProps {
  darkMode: boolean
}

export default function MainContent({ darkMode }: MainContentProps) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const isLoading = usePlayerStore(state => state.isLoading)
  const loadingMessage = usePlayerStore(state => state.loadingMessage)
  const error = usePlayerStore(state => state.error)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setFileSummary = usePlayerStore(state => state.setFileSummary)
  const setError = usePlayerStore(state => state.setError)
  const activePanel = usePlayerStore(state => state.activePanel)
  const setActivePanel = usePlayerStore(state => state.setActivePanel)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsLoading(true, 'Initializing decompression handlers...')
    try {
      await globalPlaybackController.loadFile(file)
      setActivePanel('overview')
    }
    catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to parse MCAP file')
    }
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-muted-foreground select-none">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-xs font-semibold text-foreground">{loadingMessage || 'Loading...'}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[220px] text-center">
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
    return <LandingView darkMode={darkMode} onFileChange={handleFileChange} />
  }

  // 4. File Loaded UI
  return (
    <div className="absolute inset-0 bg-background flex flex-col overflow-hidden text-foreground">
      {/* Top Header Summary */}
      <div className="p-4 border-b border-border bg-card shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center p-1.5 rounded-md bg-primary/10 text-primary">
                <FileCode className="w-4 h-4" />
              </span>
              <h1 className="text-sm font-bold tracking-tight select-all truncate max-w-[300px] md:max-w-md" title={fileSummary.name}>
                {fileSummary.name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Panel selector Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground text-[10px] font-semibold rounded-md border border-border hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all cursor-pointer outline-hidden mr-2">
                <LayoutGrid className="w-3.5 h-3.5" />
                {activePanel === 'overview' && 'Overview & Schemas'}
                {activePanel === 'messages' && 'Raw Message View'}
                {activePanel === 'image' && 'Camera Image View'}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border border-border rounded-lg text-[10px] p-1 text-popover-foreground min-w-40 shadow-md z-50">
                <DropdownMenuItem
                  onClick={() => setActivePanel('overview')}
                  className={`focus:bg-accent focus:text-accent-foreground py-1.5 px-2 rounded-md cursor-pointer ${
                    activePanel === 'overview' ? 'bg-muted font-bold' : ''
                  }`}
                >
                  Overview & Schemas
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setActivePanel('messages')}
                  className={`focus:bg-accent focus:text-accent-foreground py-1.5 px-2 rounded-md cursor-pointer ${
                    activePanel === 'messages' ? 'bg-muted font-bold' : ''
                  }`}
                >
                  Raw Message View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setActivePanel('image')}
                  className={`focus:bg-accent focus:text-accent-foreground py-1.5 px-2 rounded-md cursor-pointer ${
                    activePanel === 'image' ? 'bg-muted font-bold' : ''
                  }`}
                >
                  Camera Image View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={() => setFileSummary(null)}
              className="px-3 py-1.5 bg-secondary text-secondary-foreground text-[10px] font-semibold rounded-md border border-border hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all cursor-pointer"
            >
              Close File
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activePanel === 'overview' && <OverviewPanel fileSummary={fileSummary} />}
        {activePanel === 'messages' && <RawMessagePanel />}
        {activePanel === 'image' && <ImagePanel />}
      </div>
    </div>
  )
}
