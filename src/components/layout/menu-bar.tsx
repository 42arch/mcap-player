import { Moon, Sun } from 'lucide-react'
import { useRef } from 'react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePlayerStore } from '@/stores/use-player-store'

interface MenuBarProps {
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
}

export default function MenuBar({ darkMode, setDarkMode }: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setError = usePlayerStore(state => state.setError)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file)
      return

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
    <div className="bg-card border-b border-border p-1 shrink-0 flex items-center justify-between px-3">
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

      {/* Workspace Actions (Dark Mode Toggle) */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1 hover:bg-accent hover:text-accent-foreground rounded-xs text-muted-foreground transition-colors opacity-85 hover:opacity-100 cursor-pointer"
          title="Toggle theme"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
