import type { Locale } from '@/i18n/config'
import { CpuIcon } from '@phosphor-icons/react'
import { useLocale } from 'next-intl'
import { useTheme } from 'next-themes'
import { useRef, useTransition } from 'react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { setUserLocale } from '@/services/locale'
import { useMcapStore } from '@/stores/mcap'

export default function TitleBar() {
  const locale = useLocale()
  const { setTheme, theme } = useTheme()
  const [isPending, startTransition] = useTransition()

  const loadFile = useMcapStore(state => state.loadFile)
  const stats = useMcapStore(state => state.stats)
  const loading = useMcapStore(state => state.loading)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLanguageChange = (newLocale: Locale) => {
    if (newLocale === locale)
      return

    startTransition(async () => {
      await setUserLocale(newLocale)
      window.location.reload()
    })
  }

  const handleOpenFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      loadFile(file)
    }
  }

  return (
    <header className="h-[35px] border-b border-layout-border bg-titlebar text-text-main px-3 flex items-center justify-between text-xs select-none w-full shrink-0 font-sans z-30">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".mcap"
      />

      {/* Left side: Logo & Menu */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 font-bold text-layout-primary">
          <CpuIcon size={16} weight="fill" className="text-layout-primary" />
          <span className="tracking-tight text-[13px] font-bold text-text-main">MCAPVIEW</span>
        </div>

        <Menubar className="border-none bg-transparent h-auto p-0 gap-0.5">
          <MenubarMenu>
            <MenubarTrigger className="hover:text-text-main px-1.5 py-0.5 rounded-[2px] hover:bg-layout-hover transition-colors cursor-pointer text-text-secondary text-[11px] font-medium data-[state=open]:bg-layout-hover data-[state=open]:text-text-main">
              File
            </MenubarTrigger>
            <MenubarContent className="rounded-none border border-layout-border bg-panel text-text-main min-w-36 p-1 shadow-lg ring-0">
              <MenubarItem
                onClick={handleOpenFileClick}
                className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 flex justify-between items-center transition-colors"
              >
                <span>Open File...</span>
                <MenubarShortcut className="ml-auto text-[9px] text-text-secondary font-mono">⌘O</MenubarShortcut>
              </MenubarItem>

              <MenubarSeparator className="bg-layout-border my-1 h-px" />
              <MenubarItem className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 transition-colors">
                Exit
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="hover:text-text-main px-1.5 py-0.5 rounded-[2px] hover:bg-layout-hover transition-colors cursor-pointer text-text-secondary text-[11px] font-medium data-[state=open]:bg-layout-hover data-[state=open]:text-text-main">
              Edit
            </MenubarTrigger>
            <MenubarContent className="rounded-none border border-layout-border bg-panel text-text-main min-w-36 p-1 shadow-lg ring-0">
              <MenubarItem className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 flex justify-between items-center transition-colors">
                <span>Undo</span>
                <MenubarShortcut className="ml-auto text-[9px] text-text-secondary font-mono">⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 flex justify-between items-center transition-colors">
                <span>Redo</span>
                <MenubarShortcut className="ml-auto text-[9px] text-text-secondary font-mono">⇧⌘Z</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="hover:text-text-main px-1.5 py-0.5 rounded-[2px] hover:bg-layout-hover transition-colors cursor-pointer text-text-secondary text-[11px] font-medium data-[state=open]:bg-layout-hover data-[state=open]:text-text-main">
              Settings
            </MenubarTrigger>
            <MenubarContent className="rounded-none border border-layout-border bg-panel text-text-main min-w-36 p-1 shadow-lg ring-0">
              <MenubarSub>
                <MenubarSubTrigger className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 transition-colors data-[state=open]:bg-layout-hover data-[state=open]:text-text-main">
                  Theme
                </MenubarSubTrigger>
                <MenubarSubContent className="rounded-none border border-layout-border bg-panel text-text-main min-w-28 p-1 shadow-lg ring-0">
                  <MenubarRadioGroup value={theme} onValueChange={setTheme}>
                    <MenubarRadioItem value="light" className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1.5 px-2 pl-8 transition-colors">
                      Light
                    </MenubarRadioItem>
                    <MenubarRadioItem value="dark" className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1.5 px-2 pl-8 transition-colors">
                      Dark
                    </MenubarRadioItem>
                  </MenubarRadioGroup>
                </MenubarSubContent>
              </MenubarSub>

              <MenubarSub>
                <MenubarSubTrigger className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1 px-2 transition-colors data-[state=open]:bg-layout-hover data-[state=open]:text-text-main">
                  Language
                </MenubarSubTrigger>
                <MenubarSubContent className="rounded-none border border-layout-border bg-panel text-text-main min-w-28 p-1 shadow-lg ring-0">
                  <MenubarRadioGroup value={locale} onValueChange={val => handleLanguageChange(val as Locale)}>
                    <MenubarRadioItem value="en" className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1.5 px-2 pl-8 transition-colors" disabled={isPending}>
                      English
                    </MenubarRadioItem>
                    <MenubarRadioItem value="zh" className="text-[11px] text-text-secondary hover:text-text-main focus:bg-layout-hover focus:text-text-main hover:bg-layout-hover cursor-pointer rounded-none py-1.5 px-2 pl-8 transition-colors" disabled={isPending}>
                      简体中文
                    </MenubarRadioItem>
                  </MenubarRadioGroup>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      {/* Center: File/Workspace Name */}
      <div className="absolute left-1/2 transform -translate-x-1/2 text-text-secondary text-[11px] font-medium max-w-[30%] truncate">
        {loading ? 'Parsing Datastream...' : (stats ? stats.name : 'No File Loaded')}
      </div>

      {/* Right side: Actions & Switchers */}
      <div className="flex items-center gap-2">
      </div>
    </header>
  )
}
