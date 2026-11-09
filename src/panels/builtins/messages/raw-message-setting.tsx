import type { PanelSettingsProps, RawMessagePanelConfig } from '@/panels/core/types'
import { FormattedMessage, useIntl } from 'react-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HelpTooltip } from '../help-tooltip'
import { SettingGroup } from '../setting-group'

export default function RawMessageSetting({ config, updateConfig }: PanelSettingsProps<RawMessagePanelConfig>) {
  const intl = useIntl()
  const hzOptions = [1, 5, 10, 15, 30, 60]
  const formatOptions = [
    {
      value: 'placeholder',
      label: intl.formatMessage({ id: 'panel.messages.formatPlaceholder', defaultMessage: 'Placeholder' }),
      desc: 'e.g. <Uint8Array: 12 bytes>',
    },
    {
      value: 'hex',
      label: intl.formatMessage({ id: 'panel.messages.formatHex', defaultMessage: 'Hex Dump' }),
      desc: 'e.g. 01 f2 0c ... (max 64b)',
    },
    {
      value: 'raw',
      label: intl.formatMessage({ id: 'panel.messages.formatRaw', defaultMessage: 'Raw Numbers' }),
      desc: 'e.g. [1, 242, 12, ...] (max 64b)',
    },
  ] as const

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        {/* Refresh Rate Selector Group */}
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.messages.performance', defaultMessage: 'Performance' })}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
              <FormattedMessage id="panel.messages.refreshRate" defaultMessage="UI Refresh Rate" />
              <HelpTooltip content={intl.formatMessage({ id: 'panel.messages.refreshRateTooltip', defaultMessage: 'Limits the rendering frequency of the log rows to save CPU cycles.' })} />
            </label>
            <Select
              value={String(config.refreshRateHz)}
              onValueChange={val => updateConfig({ refreshRateHz: Number(val) })}
            >
              <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2 font-mono">
                <SelectValue placeholder={intl.formatMessage({ id: 'panel.messages.selectRefreshRate', defaultMessage: 'Select refresh rate...' })} />
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
          </div>
        </SettingGroup>

        {/* Binary Format Selector Group */}
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.messages.formatting', defaultMessage: 'Formatting' })}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
              <FormattedMessage id="panel.messages.binaryFormat" defaultMessage="Binary Byte Array Format" />
              <HelpTooltip content={intl.formatMessage({ id: 'panel.messages.binaryFormatTooltip', defaultMessage: 'Controls how raw binary Uint8Array byte fields are displayed.' })} />
            </label>
            <Select
              value={config.binaryFormat}
              onValueChange={val => updateConfig({ binaryFormat: val as RawMessagePanelConfig['binaryFormat'] })}
            >
              <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2">
                <span>
                  {formatOptions.find(o => o.value === config.binaryFormat)?.label || intl.formatMessage({ id: 'panel.messages.selectBinaryFormat', defaultMessage: 'Select binary format...' })}
                </span>
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                {formatOptions.map(opt => (
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
      </div>
    </div>
  )
}
