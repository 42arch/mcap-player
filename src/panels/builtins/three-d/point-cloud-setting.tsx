import type { SceneLayerSettingsProps } from './scene-renderer-registry'
import { ColorPicker } from '@/components/ui/color-picker'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { HelpTooltip } from '../help-tooltip'
import { readPointCloudSettings } from './point-cloud-config'

const colorModeOptions = [
  { value: 'height', label: 'Height Spectrum (Z-Axis)', description: 'Color points by Z-height elevation.' },
  { value: 'intensity', label: 'Intensity Heatmap', description: 'Color points by reflective intensity.' },
  { value: 'solid', label: 'Solid Color', description: 'Use one color for the complete point cloud.' },
] as const

export default function PointCloudSetting({ settings, updateSettings }: SceneLayerSettingsProps) {
  const { colorMode, maxPoints, pointSize, solidColor } = readPointCloudSettings(settings)

  return (
    <FieldGroup>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="flex items-center">
            Point Render Size
            <HelpTooltip content="Size of each rendered point in screen pixels." />
          </FieldLabel>
          <span className="text-xs text-muted-foreground">
            {pointSize.toFixed(1)}
            {' '}
            px
          </span>
        </div>
        <Slider
          aria-label="Point render size"
          value={[pointSize]}
          min={0.5}
          max={8}
          step={0.5}
          onValueChange={value => updateSettings({ pointSize: value[0] })}
        />
      </Field>

      <Field>
        <FieldLabel>Color Scheme</FieldLabel>
        <Select
          value={colorMode}
          onValueChange={value => updateSettings({ colorMode: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a color scheme">
              {colorModeOptions.find(option => option.value === colorMode)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {colorModeOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col gap-0.5">
                    <span>{option.label}</span>
                    <span className="text-[9px] text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {colorMode === 'solid'
        ? (
            <Field>
              <FieldLabel>Solid Color</FieldLabel>
              <ColorPicker
                value={solidColor}
                onChange={value => updateSettings({ solidColor: value })}
              />
            </Field>
          )
        : null}

      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="flex items-center">
            Maximum Points
            <HelpTooltip content="Maximum points rendered from this topic per frame." />
          </FieldLabel>
          <span className="text-xs text-muted-foreground">
            {(maxPoints / 1000).toFixed(0)}
            k
          </span>
        </div>
        <Slider
          aria-label="Maximum rendered points"
          value={[maxPoints]}
          min={20000}
          max={500000}
          step={10000}
          onValueChange={value => updateSettings({ maxPoints: value[0] })}
        />
      </Field>
    </FieldGroup>
  )
}
