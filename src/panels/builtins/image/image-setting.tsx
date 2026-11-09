import type { ImagePanelConfig, PanelSettingsProps } from '@/panels/core/types'
import { FormattedMessage, useIntl } from 'react-intl'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { HelpTooltip } from '../help-tooltip'
import { SettingGroup } from '../setting-group'

export default function ImageSetting({ config, updateConfig }: PanelSettingsProps<ImagePanelConfig>) {
  const intl = useIntl()

  const fitOptions = [
    {
      value: 'contain',
      label: intl.formatMessage({ id: 'panel.image.fitContain', defaultMessage: 'Contain' }),
      desc: intl.formatMessage({ id: 'panel.image.fitContainDesc', defaultMessage: 'Fit image fully inside container' }),
    },
    {
      value: 'cover',
      label: intl.formatMessage({ id: 'panel.image.fitCover', defaultMessage: 'Cover (Crop)' }),
      desc: intl.formatMessage({ id: 'panel.image.fitCoverDesc', defaultMessage: 'Scale image to fill container' }),
    },
    {
      value: 'fill',
      label: intl.formatMessage({ id: 'panel.image.fitFill', defaultMessage: 'Fill (Stretch)' }),
      desc: intl.formatMessage({ id: 'panel.image.fitFillDesc', defaultMessage: 'Stretch image to fill container' }),
    },
  ] as const

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      {/* Scroll Container */}
      <div className="flex-1 overflow-y-auto">
        {/* Fit Mode Selector Group */}
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.image.displayMode', defaultMessage: 'Display Mode' })}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
              <FormattedMessage id="panel.image.fitMode" defaultMessage="Image Fit Mode" />
              <HelpTooltip content={intl.formatMessage({ id: 'panel.image.fitModeTooltip', defaultMessage: 'Choose how the image scales within the panel viewport.' })} />
            </label>
            <Select
              value={config.imageFit}
              onValueChange={val => updateConfig({ imageFit: val as ImagePanelConfig['imageFit'] })}
            >
              <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2">
                <span>
                  {fitOptions.find(o => o.value === config.imageFit)?.label || intl.formatMessage({ id: 'panel.image.selectFit', defaultMessage: 'Select image fit...' })}
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
        </SettingGroup>

        {/* Brightness Adjust Slider Group */}
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.image.adjustments', defaultMessage: 'Image Adjustments' })}
          defaultOpen
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <FormattedMessage id="panel.image.brightness" defaultMessage="Image Brightness" />
                <HelpTooltip content={intl.formatMessage({ id: 'panel.image.brightnessTooltip', defaultMessage: 'Adjust the exposure and contrast brightness of the image rendering.' })} />
              </label>
              <span className="text-[10px] font-mono font-semibold text-primary">
                {Math.round(config.brightness * 100)}
                %
              </span>
            </div>
            <Slider
              value={[config.brightness]}
              min={0.1}
              max={2.0}
              step={0.05}
              onValueChange={val => updateConfig({ brightness: val[0] })}
              className="py-2 cursor-pointer"
            />
          </div>
        </SettingGroup>
      </div>
    </div>
  )
}
