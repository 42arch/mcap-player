import { CarFront, Download, FileUp, FolderOpen, Globe2, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createRemoteMcapSource } from '@/core/sources/mcap-source'
import { formatRemoteUrlError } from './remote-url-error'

interface LandingViewProps {
  darkMode: boolean
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoteUrlSubmit: (url: string) => Promise<void>
}

const EXAMPLE_MCAP_FILES = [
  {
    id: 'nuscenes-v1-mini-scene-sample',
    fileName: 'NuScenes-v1.0-mini-scene-sample.mcap',
    label: {
      id: 'landing.exampleNuScenes',
      defaultMessage: 'NuScenes v1.0 Mini · Scene Sample',
    },
    url: 'https://mcap-proxy.lichtblick.workers.dev/NuScenes-v1.0-mini-scene-sample.mcap',
  },
] as const

export default function LandingView({ darkMode, onFileChange, onRemoteUrlSubmit }: LandingViewProps) {
  const { formatMessage } = useIntl()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteError, setRemoteError] = useState<string | null>(null)

  const handleRemoteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRemoteError(null)
    try {
      const source = createRemoteMcapSource(remoteUrl)
      void onRemoteUrlSubmit(source.url)
    }
    catch (error) {
      setRemoteError(formatRemoteUrlError(error, formatMessage))
    }
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6"
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

      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-border/80 bg-card/60 p-8 text-center shadow-lg backdrop-blur-md">
        <div className="flex flex-col items-center gap-2">
          <div className="mb-2 inline-flex rounded-2xl bg-primary/10 p-4 text-primary shadow-inner">
            <FolderOpen className="size-7" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            <FormattedMessage id="landing.openFile" defaultMessage="Open MCAP File" />
          </h2>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            <FormattedMessage
              id="landing.subtitle"
              defaultMessage="Open a local MCAP file or stream one from a remote URL"
            />
          </p>
        </div>

        <Tabs defaultValue="local" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="local">
              <FileUp data-icon="inline-start" className="size-3.5" />
              <FormattedMessage id="landing.localTab" defaultMessage="Local file" />
            </TabsTrigger>
            <TabsTrigger value="remote">
              <Globe2 data-icon="inline-start" className="size-3.5" />
              <FormattedMessage id="landing.remoteTab" defaultMessage="Remote URL" />
            </TabsTrigger>
            <TabsTrigger value="examples">
              <Sparkles data-icon="inline-start" className="size-3.5" />
              <FormattedMessage id="landing.examples" defaultMessage="Examples" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="pt-4">
            <Button size="lg" onClick={() => fileInputRef.current?.click()}>
              <FolderOpen data-icon="inline-start" />
              <FormattedMessage id="landing.chooseFile" defaultMessage="Choose File" />
            </Button>
          </TabsContent>

          <TabsContent value="remote" className="pt-4">
            <form onSubmit={handleRemoteSubmit}>
              <FieldGroup>
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
                <Button type="submit" size="lg" disabled={!remoteUrl.trim()}>
                  <Globe2 data-icon="inline-start" />
                  <FormattedMessage id="landing.openRemote" defaultMessage="Open Remote File" />
                </Button>
              </FieldGroup>
            </form>
          </TabsContent>

          <TabsContent value="examples" className="pt-4">
            <div className="flex flex-col gap-2">
              {EXAMPLE_MCAP_FILES.map(example => (
                <div key={example.id} className="flex min-w-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-w-0 flex-1 justify-start"
                    title={example.url}
                    onClick={() => void onRemoteUrlSubmit(example.url)}
                  >
                    <CarFront data-icon="inline-start" />
                    <span className="truncate">
                      <FormattedMessage {...example.label} />
                    </span>
                  </Button>
                  <Button asChild variant="outline" size="icon-lg">
                    <a
                      href={example.url}
                      download={example.fileName}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={formatMessage(
                        { id: 'landing.downloadExample', defaultMessage: 'Download {name}' },
                        { name: formatMessage(example.label) },
                      )}
                      title={formatMessage(
                        { id: 'landing.downloadExample', defaultMessage: 'Download {name}' },
                        { name: formatMessage(example.label) },
                      )}
                    >
                      <Download data-icon="inline-start" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t border-border/50 pt-2 text-[10px] text-muted-foreground/60">
          <FormattedMessage
            id="landing.supportedFormats"
            defaultMessage="Supports MCAP files with uncompressed, Zstd, or LZ4 chunks"
          />
        </div>
      </div>
    </div>
  )
}
