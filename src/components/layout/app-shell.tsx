import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import LeftSideBar from './left-side-bar'
import MainContent from './main-content'
import MenuBar from './menu-bar'
import PlayBack from './play-back'

export default function AppShell() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-screen bg-background" />
  }

  const darkMode = resolvedTheme === 'dark'
  const setDarkMode = (dark: boolean) => setTheme(dark ? 'dark' : 'light')

  return (
    <div className="workspace-font-override h-screen flex flex-col bg-background text-foreground select-none text-[11px] font-sans tracking-tight antialiased transition-colors duration-300">
      {/* Workspace Menubar */}
      <MenuBar darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Editor Body */}
      <div className="flex-1 flex min-h-0">
        <ResizablePanelGroup orientation="vertical" className="flex-1">
          {/* Top panel containing sidebar and main canvas */}
          <ResizablePanel defaultSize="90%" className="flex min-h-0">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              {/* Left Side Bar */}
              <ResizablePanel defaultSize="25%" minSize="20%" maxSize="30%" className="bg-card flex flex-col shrink-0">
                <LeftSideBar />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Center Main Content Area */}
              <ResizablePanel defaultSize="75%" className="relative bg-background overflow-hidden">
                <MainContent darkMode={darkMode} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle />

          {/* Bottom Panel (PlayBack Controller) */}
          <ResizablePanel defaultSize="10%" minSize="10%" maxSize="10%" className="bg-card shrink-0">
            <PlayBack />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
