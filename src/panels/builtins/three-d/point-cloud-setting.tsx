import type { SceneLayerSettingsProps } from './scene-renderer-registry'
import { FormattedMessage, useIntl } from 'react-intl'
import { ColorPicker } from '@/components/ui/color-picker'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { HelpTooltip } from '../help-tooltip'
import { readPointCloudSettings } from './point-cloud-config'

export default function PointCloudSetting({ settings, updateSettings }: SceneLayerSettingsProps) {
  const intl = useIntl()
  const { colorMode, maxPoints, pointSize, solidColor } = readPointCloudSettings(settings)

  const colorModeOptions = [
    {
      value: 'height',
      label: intl.formatMessage({ id: 'panel.3d.colorHeight', defaultMessage: 'Height Spectrum (Z-Axis)' }),
      description: intl.formatMessage({ id: 'panel.3d.colorHeightDesc', defaultMessage: 'Color points by Z-height elevation.' }),
    },
    {
      value: 'intensity',
      label: intl.formatMessage({ id: 'panel.3d.colorIntensity', defaultMessage: 'Intensity Heatmap' }),
      description: intl.formatMessage({ id: 'panel.3d.colorIntensityDesc', defaultMessage: 'Color points by reflective intensity.' }),
    },
    {
      value: 'solid',
      label: intl.formatMessage({ id: 'panel.3d.colorSolid', defaultMessage: 'Solid Color' }),
      description: intl.formatMessage({ id: 'panel.3d.colorSolidDesc', defaultMessage: 'Use one color for the complete point cloud.' }),
    },
  ] as const

  return (
    <FieldGroup>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel className="flex items-center">
            <FormattedMessage id="panel.3d.pointSize" defaultMessage="Point Render Size" />
            <HelpTooltip content={intl.formatMessage({ id: 'panel.3d.pointSizeTooltip', defaultMessage: 'Size of each rendered point in screen pixels.' })} />
          </FieldLabel>
          <span className="text-xs text-muted-foreground">
            {pointSize.toFixed(1)}
            {' '}
            px
          </span>
        </div>
        <Slider
          aria-label={intl.formatMessage({ id: 'panel.3d.pointSize', defaultMessage: 'Point Render Size' })}
          value={[pointSize]}
          min={0.5}
          max={8}
          step={0.5}
          onValueChange={value => updateSettings({ pointSize: value[0] })}
        />
      </Field>

      <Field>
        <FieldLabel>
          <FormattedMessage id="panel.3d.colorScheme" defaultMessage="Color Scheme" />
        </FieldLabel>
        <Select
          value={colorMode}
          onValueChange={value => updateSettings({ colorMode: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={intl.formatMessage({ id: 'panel.3d.selectColorScheme', defaultMessage: 'Select a color scheme' })}>
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
              <FieldLabel>
                <FormattedMessage id="panel.3d.colorSolid" defaultMessage="Solid Color" />
              </FieldLabel>
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
            <FormattedMessage id="panel.3d.maxPoints" defaultMessage="Maximum Points" />
            <HelpTooltip content={intl.formatMessage({ id: 'panel.3d.maxPointsTooltip', defaultMessage: 'Maximum points rendered from this topic per frame.' })} />
          </FieldLabel>
          <span className="text-xs text-muted-foreground">
            {(maxPoints / 1000).toFixed(0)}
            k
          </span>
        </div>
        <Slider
          aria-label={intl.formatMessage({ id: 'panel.3d.maxPoints', defaultMessage: 'Maximum Points' })}
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
