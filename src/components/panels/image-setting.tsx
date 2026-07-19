import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { usePlayerStore } from '@/stores/use-player-store'

export default function ImageSetting() {
  const messagesSettings = usePlayerStore(state => state.messagesSettings)
  const updateMessagesSettings = usePlayerStore(state => state.updateMessagesSettings)
  const imageSettings = usePlayerStore(state => state.imageSettings)
  const updateImageSettings = usePlayerStore(state => state.updateImageSettings)

  const hzOptions = [1, 5, 10, 15, 30, 60]
  const fitOptions = [
    { value: 'contain', label: 'Contain', desc: 'Fit image fully inside container' },
    { value: 'cover', label: 'Cover (Crop)', desc: 'Scale image to fill container' },
    { value: 'fill', label: 'Fill (Stretch)', desc: 'Stretch image to fill container' },
  ] as const

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-card text-foreground">
      {/* Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Refresh Rate Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Camera Refresh Rate
          </label>
          <Select
            value={String(messagesSettings.refreshRateHz)}
            onValueChange={val => updateMessagesSettings({ refreshRateHz: Number(val) })}
          >
            <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2 font-mono">
              <SelectValue placeholder="Select refresh rate..." />
            </SelectTrigger>
            <SelectContent position="popper" className="bg-popover text-popover-foreground">
              {hzOptions.map(hz => (
                <SelectItem key={hz} value={String(hz)} className="font-mono text-[11px] py-1 h-8">
                  {hz}
                  {' '}
                  Hz
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Limits the rendering frequency of the camera viewport to save CPU.
          </span>
        </div>

        {/* Fit Mode Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Image Fit Mode
          </label>
          <Select
            value={imageSettings.imageFit}
            onValueChange={val => updateImageSettings({ imageFit: val as any })}
          >
            <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2">
              <span>
                {fitOptions.find(o => o.value === imageSettings.imageFit)?.label || 'Select image fit...'}
              </span>
            </SelectTrigger>
            <SelectContent position="popper" className="bg-popover text-popover-foreground">
              {fitOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-[11px] py-1.5 min-h-8">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-medium text-[11px] text-foreground">{opt.label}</span>
                    <span className="text-[9px] text-muted-foreground/60">{opt.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brightness Adjust Slider */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Image Brightness
            </label>
            <span className="text-[10px] font-mono font-semibold text-primary">
              {Math.round(imageSettings.brightness * 100)}
              %
            </span>
          </div>
          <Slider
            value={[imageSettings.brightness]}
            min={0.1}
            max={2.0}
            step={0.05}
            onValueChange={val => updateImageSettings({ brightness: val[0] })}
            className="py-2 cursor-pointer"
          />
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Adjust the exposure and contrast brightness of the image rendering.
          </span>
        </div>

      </div>
    </div>
  )
}
