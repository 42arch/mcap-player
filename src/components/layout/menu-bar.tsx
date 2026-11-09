import type { SupportedLocale } from '@/stores/use-locale-store'
import { FileCode, Globe2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { globalPlaybackController } from '@/core/playback-controller'
import { createRemoteMcapSource } from '@/core/sources/mcap-source'
import { useAnalytics } from '@/hooks/use-analytics'
import { buildExportData, downloadJsonFile, parseAndValidateConfig } from '@/panels/core/config-io'
import { useLocaleStore } from '@/stores/use-locale-store'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import { formatRemoteUrlError } from './remote-url-error'

export default function MenuBar() {
  const { captureMcapOpened } = useAnalytics()
  const { formatMessage } = useIntl()
  const { theme, setTheme } = useTheme()
  const locale = useLocaleStore(state => state.locale)
  const setLocale = useLocaleStore(state => state.setLocale)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const layoutInputRef = useRef<HTMLInputElement>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setError = usePlayerStore(state => state.setError)
  const resetPanels = usePanelStore(state => state.resetPanels)
  const dockviewApi = usePanelStore(state => state.dockviewApi)

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
    captureMcapOpened({
      source: 'menu',
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
    finally {
      setIsLoading(false)
      if (fileInputRef.current)
        fileInputRef.current.value = ''
    }
  }

  const handleOpenClick = () => {
    fileInputRef.current?.click()
  }

  const handleOpenRemoteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRemoteError(null)

    let normalizedUrl: string
    try {
      normalizedUrl = createRemoteMcapSource(remoteUrl).url
    }
    catch (error) {
      setRemoteError(formatRemoteUrlError(error, formatMessage))
      return
    }

    captureMcapOpened({ source: 'menu', method: 'remote' })
    resetPanels()
    setIsLoading(true, 'Reading remote MCAP indexes...')
    try {
      await globalPlaybackController.loadRemoteUrl(normalizedUrl)
      setRemoteUrl('')
    }
    catch (err: any) {
      console.error('Failed to load remote MCAP:', err)
      globalPlaybackController.closeFile()
      setError(err.message || 'Failed to load remote MCAP file')
    }
  }

  const handleExportLayout = () => {
    const { panelsById, panelOrder } = usePanelStore.getState()
    const exportData = buildExportData(panelsById, panelOrder, dockviewApi)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadJsonFile(exportData, `mcapview-layout-${dateStr}.json`)
    toast.success('Layout configuration exported successfully')
  }

  const handleImportLayoutClick = () => {
    layoutInputRef.current?.click()
  }

  const handleLayoutFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const configData = parseAndValidateConfig(text)

      usePanelStore.getState().loadPanelsState(configData.panelsById, configData.panelOrder)

      if (dockviewApi && configData.dockviewLayout) {
        dockviewApi.fromJSON(configData.dockviewLayout as any)
      }
      toast.success('Layout configuration imported successfully')
    }
    catch (err: any) {
      console.error('Failed to import layout:', err)
      toast.error(err.message || 'Failed to import layout configuration')
    }
    finally {
      if (layoutInputRef.current) {
        layoutInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="relative flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".mcap"
        className="hidden"
      />
      <input
        type="file"
        ref={layoutInputRef}
        onChange={handleLayoutFileChange}
        accept=".json"
        className="hidden"
      />

      <Menubar className="border-none bg-transparent h-7 p-0 flex gap-1">
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            <FormattedMessage id="menu.file" defaultMessage="File" />
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem disabled className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
              <FormattedMessage id="menu.newProject" defaultMessage="New Project" />
            </MenubarItem>
            <MenubarItem
              onClick={handleOpenClick}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              <FormattedMessage id="menu.openFile" defaultMessage="Open File" />
            </MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                <FormattedMessage id="menu.openRemote" defaultMessage="Open Remote URL" />
              </MenubarSubTrigger>
              <MenubarSubContent className="w-80 border-border bg-popover p-3 text-popover-foreground">
                <form className="flex flex-col gap-3" onSubmit={event => void handleOpenRemoteSubmit(event)}>
                  <Field data-invalid={remoteError !== null}>
                    <Input
                      type="url"
                      value={remoteUrl}
                      onChange={(event) => {
                        setRemoteUrl(event.target.value)
                        if (remoteError) {
                          setRemoteError(null)
                        }
                      }}
                      placeholder={formatMessage({
                        id: 'landing.remotePlaceholder',
                        defaultMessage: 'https://example.com/recording.mcap',
                      })}
                      aria-label={formatMessage({ id: 'landing.remoteUrlLabel', defaultMessage: 'Remote MCAP URL' })}
                      aria-invalid={remoteError !== null}
                      autoComplete="url"
                    />
                    <FieldError>{remoteError}</FieldError>
                  </Field>
                  <Button type="submit" disabled={!remoteUrl.trim()}>
                    <Globe2 data-icon="inline-start" />
                    <FormattedMessage id="landing.openRemote" defaultMessage="Open Remote File" />
                  </Button>
                </form>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem
              disabled={!fileSummary}
              onClick={handleCloseFile}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              <FormattedMessage id="menu.closeFile" defaultMessage="Close File" />
            </MenubarItem>
            <MenubarSeparator className="bg-border" />
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
              <FormattedMessage id="menu.save" defaultMessage="Save" />
            </MenubarItem>
            <MenubarItem disabled className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
              <FormattedMessage id="menu.exportProject" defaultMessage="Export Project" />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            <FormattedMessage id="menu.layout" defaultMessage="Layout" />
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem
              onClick={handleImportLayoutClick}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              <FormattedMessage id="menu.importLayout" defaultMessage="Import Layout" />
            </MenubarItem>
            <MenubarItem
              onClick={handleExportLayout}
              className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer"
            >
              <FormattedMessage id="menu.exportLayout" defaultMessage="Export Layout" />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            <FormattedMessage id="menu.settings" defaultMessage="Settings" />
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarSub>
              <MenubarSubTrigger className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                <FormattedMessage id="menu.language" defaultMessage="Language" />
              </MenubarSubTrigger>
              <MenubarSubContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-32">
                <MenubarRadioGroup value={locale} onValueChange={val => setLocale(val as SupportedLocale)}>
                  <MenubarRadioItem value="zh-CN" className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                    中文
                  </MenubarRadioItem>
                  <MenubarRadioItem value="en-US" className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                    English
                  </MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                <FormattedMessage id="menu.theme" defaultMessage="Theme" />
              </MenubarSubTrigger>
              <MenubarSubContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-32">
                <MenubarRadioGroup value={theme} onValueChange={setTheme}>
                  <MenubarRadioItem value="light" className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                    <FormattedMessage id="menu.themeLight" defaultMessage="Light" />
                  </MenubarRadioItem>
                  <MenubarRadioItem value="dark" className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                    <FormattedMessage id="menu.themeDark" defaultMessage="Dark" />
                  </MenubarRadioItem>
                  <MenubarRadioItem value="system" className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
                    <FormattedMessage id="menu.themeSystem" defaultMessage="System" />
                  </MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-foreground font-medium rounded-xs cursor-pointer">
            <FormattedMessage id="menu.help" defaultMessage="Help" />
          </MenubarTrigger>
          <MenubarContent className="bg-popover border-border rounded-xs text-[11px] p-0.5 text-popover-foreground min-w-36">
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
              <FormattedMessage id="menu.documentation" defaultMessage="Documentation" />
            </MenubarItem>
            <MenubarItem className="focus:bg-accent focus:text-accent-foreground py-1 px-2 rounded-xs cursor-pointer">
              <FormattedMessage id="menu.versionInfo" defaultMessage="Version Info" />
            </MenubarItem>
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

      <Button
        variant="ghost"
        size="icon-sm"
        asChild
      >
        <a
          href="https://github.com/42arch/mcap-player"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub Repository"
        >
          <img src="/github.svg" className="w-3.5 h-3.5 dark:invert" alt="GitHub" />
        </a>
      </Button>
    </div>
  )
}
