import { FileCode, Moon, Sun } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from '@/components/ui/menubar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'

interface MenuBarProps {
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
}

export default function MenuBar({ darkMode, setDarkMode }: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setError = usePlayerStore(state => state.setError)
  const resetPanels = usePanelStore(state => state.resetPanels)

  const handleCloseFile = () => {
    resetPanels()
    globalPlaybackController.closeFile()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file)
      return

    resetPanels()
    setIsLoading(true, 'Reading MCAP file...')
    try {
      await globalPlaybackController.loadFile(file)
    }
    catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to parse MCAP file')
    }
    finally {
      setIsLoading(false)
      if (fileInputRef.current)
        fileInputRef.current.value = ''
    }
  }

  const handleOpenClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="relative flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".mcap"
        className="hidden"
      />

      <Menubar className="border-none bg-transparent h-7 p-0 flex gap-1">
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            File
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">New Project</MenubarItem>
            <MenubarItem
              onClick={handleOpenClick}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              Open File...
            </MenubarItem>
            <MenubarItem
              disabled={!fileSummary}
              onClick={handleCloseFile}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              Close File
            </MenubarItem>
            <MenubarSeparator className="bg-border" />
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Save</MenubarItem>
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Export Project...</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            Edit
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Undo</MenubarItem>
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Redo</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            View
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Zoom In</MenubarItem>
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Zoom Out</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            Help
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Documentation</MenubarItem>
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">Version Info</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {fileSummary && (
        <div className="pointer-events-none absolute left-1/2 max-w-[42vw] -translate-x-1/2 text-muted-foreground">
          <FileCode className="absolute right-full mr-1.5 size-3.5" aria-hidden="true" />
          <span
            className="block truncate text-[11px] font-medium text-foreground select-text"
            title={fileSummary.name}
          >
            {fileSummary.name}
          </span>
        </div>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
          >
            {darkMode
              ? <Sun data-icon="inline-start" className="w-3.5 h-3.5" />
              : <Moon data-icon="inline-start" className="w-3.5 h-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Toggle theme</TooltipContent>
      </Tooltip>
    </div>
  )
}
