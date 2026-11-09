import type { PanelSettingsProps, PlotPanelConfig } from '@/panels/core/types'
import { Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getNumericFields } from '@/core/parsers/value-extractor'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePlayerStore } from '@/stores/use-player-store'
import { SettingGroup } from '../setting-group'

export default function PlotSetting({ config, updateConfig }: PanelSettingsProps<PlotPanelConfig>) {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const plotSeries = config.series
  const availablePlotFields = config.availableFieldsByTopic

  const updatePlotSeries = (id: string, updates: Partial<PlotPanelConfig['series'][number]>) => {
    updateConfig({ series: plotSeries.map(series => series.id === id ? { ...series, ...updates } : series) })
  }
  const removePlotSeries = (id: string) => {
    updateConfig({ series: plotSeries.filter(series => series.id !== id) })
  }
  const addPlotSeries = () => {
    const nextIndex = plotSeries.length + 1
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
    updateConfig({
      series: [...plotSeries, {
        id: nanoid(),
        name: `Series ${nextIndex}`,
        topic: '',
        path: '',
        lineStyle: 'solid',
        lineWidth: 2,
        color: palette[(nextIndex - 1) % palette.length],
      }],
    })
  }
  const setAvailablePlotFieldsForTopic = (topic: string, fields: string[]) => {
    updateConfig({ availableFieldsByTopic: { ...availablePlotFields, [topic]: fields } })
  }

  const channels = fileSummary?.channels || []

  // Detect and scan first frame for series topics dynamically if not already scanned
  useEffect(() => {
    for (const s of plotSeries) {
      if (s.topic && availablePlotFields[s.topic] === undefined) {
        setAvailablePlotFieldsForTopic(s.topic, [])
        globalPlaybackController.getFirstMessagePayload(s.topic)
          .then((payload) => {
            if (payload) {
              const fields = getNumericFields(payload)
              setAvailablePlotFieldsForTopic(s.topic, fields)
            }
          })
          .catch((err) => {
            console.error('Error scanning topic on setting page:', err)
          })
      }
    }
  }, [plotSeries, availablePlotFields])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      <ScrollArea className="flex-1 min-h-0">
        {/* Plot Series Group */}
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.plot.seriesCount', defaultMessage: 'Plot Series ({count})' }, { count: plotSeries.length })}
          defaultOpen
          action={(
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={addPlotSeries}
              title={intl.formatMessage({ id: 'panel.plot.addSeries', defaultMessage: 'Add Series' })}
            >
              <Plus className="size-3.5" />
            </Button>
          )}
        >
          {/* Series Cards list */}
          <div className="space-y-3">
            {plotSeries.map((s) => {
              const fields = availablePlotFields[s.topic] || []
              return (
                <div key={s.id} className="p-2.5 border border-border bg-background rounded-lg space-y-2.5 relative group">
                  {/* Card Title & Remove Btn */}
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={s.name}
                      onChange={e => updatePlotSeries(s.id, { name: e.target.value })}
                      className="font-bold text-[11px] bg-transparent focus:outline-hidden focus:border-b border-border/80 w-2/3 py-0.5 truncate"
                    />
                    <button
                      onClick={() => removePlotSeries(s.id)}
                      className="text-muted-foreground hover:text-destructive opacity-40 group-hover:opacity-100 transition-all p-1 cursor-pointer"
                      title={intl.formatMessage({ id: 'panel.plot.deleteSeries', defaultMessage: 'Delete Series' })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Topic Selector */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block">
                      <FormattedMessage id="panel.plot.topic" defaultMessage="Topic" />
                    </span>
                    <Select
                      value={s.topic}
                      onValueChange={val => updatePlotSeries(s.id, { topic: val, path: '' })}
                    >
                      <SelectTrigger className="w-full bg-background border-border text-[10px] h-7 px-2 font-mono truncate">
                        <SelectValue placeholder={intl.formatMessage({ id: 'panel.plot.selectTopic', defaultMessage: 'Select topic...' })} />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-popover text-popover-foreground max-h-52">
                        {channels.map(ch => (
                          <SelectItem key={ch.id} value={ch.topic} className="font-mono text-[10px] py-1 h-7 min-h-0">
                            {ch.topic}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Path Selector */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block">
                      <FormattedMessage id="panel.plot.valuePath" defaultMessage="Y-Value Path" />
                    </span>
                    {s.topic
                      ? (
                          fields.length > 0
                            ? (
                                <Select
                                  value={s.path}
                                  onValueChange={val => updatePlotSeries(s.id, { path: val })}
                                >
                                  <SelectTrigger className="w-full bg-background border-border text-[10px] h-7 px-2 font-mono truncate">
                                    <SelectValue placeholder={intl.formatMessage({ id: 'panel.plot.selectField', defaultMessage: 'Select numeric field...' })} />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className="bg-popover text-popover-foreground max-h-52">
                                    {fields.map(f => (
                                      <SelectItem key={f} value={f} className="font-mono text-[10px] py-1 h-7 min-h-0">
                                        {f}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                            : (
                                <div className="p-2 bg-muted/30 border border-border/80 rounded-md text-[9px] text-muted-foreground select-none">
                                  <FormattedMessage id="panel.plot.noFields" defaultMessage="No numeric fields detected. Please play the file." />
                                </div>
                              )
                        )
                      : (
                          <div className="p-2 bg-muted/20 border border-dashed border-border rounded-md text-[9px] text-muted-foreground select-none text-center">
                            <FormattedMessage id="panel.plot.selectTopicFirst" defaultMessage="Select a topic first" />
                          </div>
                        )}
                  </div>

                  {/* Style Settings Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-border/40">
                    {/* Style */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-muted-foreground font-bold uppercase block">
                        <FormattedMessage id="panel.plot.style" defaultMessage="Style" />
                      </span>
                      <Select
                        value={s.lineStyle}
                        onValueChange={val => updatePlotSeries(s.id, { lineStyle: val as 'solid' | 'dashed' })}
                      >
                        <SelectTrigger className="w-full bg-background border-border text-[9px] h-6 px-1 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="bg-popover text-popover-foreground text-[10px]">
                          <SelectItem value="solid" className="text-[10px] py-1">
                            <FormattedMessage id="panel.plot.styleSolid" defaultMessage="Solid" />
                          </SelectItem>
                          <SelectItem value="dashed" className="text-[10px] py-1">
                            <FormattedMessage id="panel.plot.styleDashed" defaultMessage="Dashed" />
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Width */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-muted-foreground font-bold uppercase block">
                        <FormattedMessage id="panel.plot.width" defaultMessage="Width" />
                      </span>
                      <Select
                        value={String(s.lineWidth)}
                        onValueChange={val => updatePlotSeries(s.id, { lineWidth: Number(val) })}
                      >
                        <SelectTrigger className="w-full bg-background border-border text-[9px] h-6 px-1 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="bg-popover text-popover-foreground text-[10px]">
                          {[1, 2, 3, 4].map(w => (
                            <SelectItem key={w} value={String(w)} className="text-[10px] py-1">
                              {w}
                              px
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Color */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-muted-foreground font-bold uppercase block">
                        <FormattedMessage id="panel.plot.color" defaultMessage="Color" />
                      </span>
                      <ColorPicker
                        value={s.color}
                        onChange={color => updatePlotSeries(s.id, { color })}
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            {plotSeries.length === 0 && (
              <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-lg text-[10px]">
                <FormattedMessage id="panel.plot.emptySeries" defaultMessage="No active series. Click \"Add Series\" to start visualizing metrics." />
              </div>
            )}
          </div>
        </SettingGroup>
      </ScrollArea>
    </div>
  )
}
