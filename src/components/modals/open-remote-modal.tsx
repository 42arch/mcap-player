import { Globe, Link2 } from 'lucide-react'
import { useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'

interface OpenRemoteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SAMPLE_URLS = [
  {
    name: 'Foxglove NuScenes Sample',
    url: 'https://raw.githubusercontent.com/foxglove/mcap/main/tests/conformance/data/mcap/array_of_complex_messages.mcap',
  },
]

export function OpenRemoteModal({ open, onOpenChange }: OpenRemoteModalProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const setIsLoading = usePlayerStore(state => state.setIsLoading)
  const setError = usePlayerStore(state => state.setError)
  const resetPanels = usePanelStore(state => state.resetPanels)

  const handleLoad = async (targetUrl?: string) => {
    const activeUrl = (targetUrl || url).trim()
    if (!activeUrl) {
      toast.error('Please enter a valid MCAP URL')
      return
    }

    try {
      new URL(activeUrl)
    }
    catch {
      toast.error('Invalid URL format. Please include http:// or https://')
      return
    }

    setLoading(true)
    onOpenChange(false)
    resetPanels()
    setIsLoading(true, 'Connecting and fetching remote MCAP index...')

    try {
      await globalPlaybackController.loadUrl(activeUrl)
      toast.success('Remote MCAP loaded successfully')
    }
    catch (err: any) {
      console.error('Failed to load remote MCAP:', err)
      const errorMsg = err.message || 'Failed to load remote MCAP file. Ensure the server supports CORS and Range requests.'
      setError(errorMsg)
      toast.error(errorMsg)
    }
    finally {
      setIsLoading(false)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <FormattedMessage id="remote.dialogTitle" defaultMessage="Open Remote MCAP File" />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              id="remote.dialogDescription"
              defaultMessage="Enter the HTTP/HTTPS URL of a remote MCAP file. Server must support CORS and Range Requests."
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="remote-mcap-url">
              <FormattedMessage id="remote.urlLabel" defaultMessage="MCAP File URL" />
            </Label>
            <div className="relative">
              <Link2 className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="remote-mcap-url"
                placeholder="https://example.com/data.mcap"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLoad()
                  }
                }}
                className="pl-9"
              />
            </div>
          </div>

          {SAMPLE_URLS.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                <FormattedMessage id="remote.sampleUrls" defaultMessage="Sample Datasets:" />
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_URLS.map(sample => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => {
                      setUrl(sample.url)
                    }}
                    className="text-[11px] px-2 py-1 bg-muted hover:bg-accent text-foreground hover:text-accent-foreground rounded-md border border-border transition-colors cursor-pointer"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <FormattedMessage id="remote.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            type="button"
            onClick={() => handleLoad()}
            disabled={loading || !url.trim()}
          >
            <FormattedMessage id="remote.load" defaultMessage="Load Remote File" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
