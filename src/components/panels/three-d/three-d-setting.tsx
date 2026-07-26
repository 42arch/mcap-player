import { Eye, EyeOff, Tags } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { getThreeDTopicKind, isThreeDChannel } from '@/components/panels/three-d/three-d-topic'
import { globalPlaybackController } from '@/core/playback-controller'
import { collectSceneLabelFields } from '@/lib/scene-labels'
import { usePlayerStore } from '@/stores/use-player-store'

export default function ThreeDSetting() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const threeDSettings = usePlayerStore(state => state.threeDSettings)
  const updateThreeDSettings = usePlayerStore(state => state.updateThreeDSettings)
  const toggleTopicVisibility = usePlayerStore(state => state.toggleTopicVisibility)
  const setAllTopicsVisibility = usePlayerStore(state => state.setAllTopicsVisibility)
  const subscribedTopics = usePlayerStore(state => state.subscribedTopics)

  // Filter channels supported by the 3D renderer.
  const channels = fileSummary?.channels
  const spatial3DTopics = useMemo(
    () => (channels || []).filter(isThreeDChannel),
    [channels],
  )
  const sceneUpdateTopics = useMemo(
    () => spatial3DTopics.filter(
      channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'scene-update',
    ),
    [spatial3DTopics],
  )
  const [labelFieldOptions, setLabelFieldOptions] = useState<Record<string, string[]>>({})
  const labelTopics = useMemo(
    () => sceneUpdateTopics.filter(channel => (labelFieldOptions[channel.topic]?.length || 0) > 0),
    [sceneUpdateTopics, labelFieldOptions],
  )

  const topicNames = spatial3DTopics.map(ch => ch.topic)

  useEffect(() => {
    let isCancelled = false
    if (sceneUpdateTopics.length === 0) {
      setLabelFieldOptions({})
      return
    }

    Promise.all(
      sceneUpdateTopics.map(async (channel) => {
        const payload = await globalPlaybackController.getFirstMessagePayload(channel.topic)
        return [channel.topic, collectSceneLabelFields(payload)] as const
      }),
    )
      .then((entries) => {
        if (!isCancelled) {
          setLabelFieldOptions(Object.fromEntries(entries))
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLabelFieldOptions({})
        }
      })

    return () => {
      isCancelled = true
    }
  }, [sceneUpdateTopics])

  const handleSelectAll = (visible: boolean) => {
    setAllTopicsVisibility(topicNames, visible)
    if (visible) {
      const next = new Set(subscribedTopics)
      for (const t of topicNames) {
        next.add(t)
      }
      // Also subscribe to /tf for coordinate transform
      next.add('/tf')
      usePlayerStore.getState().setSubscribedTopics(next)
      globalPlaybackController.triggerBackfill()
    }
  }

  const handleToggleTopic = (topic: string) => {
    toggleTopicVisibility(topic)
    const isNowVisible = threeDSettings.visibleTopics[topic] === false // Will flip to true
    if (isNowVisible && !subscribedTopics.has(topic)) {
      const next = new Set(subscribedTopics)
      next.add(topic)
      next.add('/tf')
      usePlayerStore.getState().setSubscribedTopics(next)
      globalPlaybackController.triggerBackfill()
    }
  }

  const handleToggleLabelField = (topic: string, field: string) => {
    const currentFields = threeDSettings.labelFieldsByTopic[topic] || []
    const nextFields = currentFields.includes(field)
      ? currentFields.filter(value => value !== field)
      : [...currentFields, field]

    updateThreeDSettings({
      labelFieldsByTopic: {
        ...threeDSettings.labelFieldsByTopic,
        [topic]: nextFields,
      },
    })
  }

  const colorModeOptions = [
    { value: 'height', label: 'Height Spectrum (Z-Axis)', desc: 'Color points based on Z-height elevation' },
    { value: 'intensity', label: 'Intensity Heatmap', desc: 'Color points based on reflective intensity' },
    { value: 'solid', label: 'Solid Color', desc: 'Use uniform custom color for all points' },
  ] as const

  const isAnyVisible = topicNames.some(t => threeDSettings.visibleTopics[t] !== false)

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-card text-foreground select-none">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* 3D Layer Settings (三维图层设置) Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              3D Layer Settings (三维图层设置) (
              {topicNames.length}
              )
            </label>
            {topicNames.length > 0 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleSelectAll(!isAnyVisible)}
                className={isAnyVisible ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/40 hover:bg-muted/50'}
                title={isAnyVisible ? 'Hide All Layers (全关隐藏)' : 'Show All Layers (全选显示)'}
              >
                {isAnyVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </Button>
            )}
          </div>

          <div className="space-y-0.5 max-h-60 overflow-y-auto pr-1">
            {spatial3DTopics.length > 0
              ? (
                  spatial3DTopics.map((ch) => {
                    const isVisible = threeDSettings.visibleTopics[ch.topic] !== false
                    return (
                      <div
                        key={ch.id}
                        onClick={() => handleToggleTopic(ch.topic)}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-md transition-all cursor-pointer ${
                          isVisible
                            ? 'hover:bg-accent/60 text-foreground'
                            : 'text-muted-foreground/50 opacity-50 hover:opacity-80 hover:bg-accent/30'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="font-mono text-[11px] font-medium truncate" title={ch.topic}>
                            {ch.topic}
                          </span>
                          {ch.schemaName && (
                            <span className="text-[9px] text-muted-foreground/60 truncate">
                              {ch.schemaName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-mono text-muted-foreground/60">
                            {ch.messageCount}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleTopic(ch.topic)
                            }}
                            className={isVisible ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/40 hover:bg-muted/50'}
                            title={isVisible ? 'Hide Layer' : 'Show Layer'}
                          >
                            {isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-50" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )
              : (
                  <div className="py-3 text-[10px] text-muted-foreground text-center">
                    No 3D spatial topics detected in MCAP file
                  </div>
                )}
          </div>
        </div>

        {/* Derived labels for SceneUpdate entities */}
        {labelTopics.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5">
              <Tags className="size-3.5 text-muted-foreground" />
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Annotation Labels (标注标签)
              </label>
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
              Select entity fields to combine into labels above SceneUpdate geometry.
            </p>

            <div className="space-y-3">
              {labelTopics.map((channel) => {
                const fields = labelFieldOptions[channel.topic] || []
                const selectedFields = threeDSettings.labelFieldsByTopic[channel.topic] || []
                return (
                  <div key={channel.id} className="space-y-2 rounded-md border border-border/70 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-medium truncate" title={channel.topic}>
                        {channel.topic}
                      </span>
                      {selectedFields.length > 0 && (
                        <span className="shrink-0 text-[9px] text-primary">
                          {selectedFields.length}
                          {' '}
                          selected
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {fields.map((field) => {
                        const isSelected = selectedFields.includes(field)
                        return (
                          <Button
                            key={field}
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 px-2 text-[9px] font-mono"
                            onClick={() => handleToggleLabelField(channel.topic, field)}
                            aria-pressed={isSelected}
                          >
                            {field}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Scene Background Color */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Scene Background Color
          </label>
          <ColorPicker
            value={threeDSettings.backgroundColor || '#ffffff'}
            onChange={val => updateThreeDSettings({ backgroundColor: val })}
          />
        </div>

        {/* Point Size Slider */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Point Render Size
            </label>
            <span className="text-[10px] font-mono font-semibold text-primary">
              {threeDSettings.pointSize.toFixed(1)}
              px
            </span>
          </div>
          <Slider
            value={[threeDSettings.pointSize]}
            min={0.5}
            max={8.0}
            step={0.5}
            onValueChange={val => updateThreeDSettings({ pointSize: val[0] })}
            className="py-1.5 cursor-pointer"
          />
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Adjust rendering size of individual 3D points in screen pixels.
          </span>
        </div>

        {/* Color Mode Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Color Scheme
          </label>
          <Select
            value={threeDSettings.colorMode}
            onValueChange={val => updateThreeDSettings({ colorMode: val as any })}
          >
            <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2">
              <span>
                {colorModeOptions.find(o => o.value === threeDSettings.colorMode)?.label || 'Select color scheme...'}
              </span>
            </SelectTrigger>
            <SelectContent position="popper" className="bg-popover text-popover-foreground">
              {colorModeOptions.map(opt => (
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

        {/* Solid Color Picker if Solid Color Mode */}
        {threeDSettings.colorMode === 'solid' && (
          <div className="space-y-2.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Custom Solid Color
            </label>
            <ColorPicker
              value={threeDSettings.solidColor || '#00ffcc'}
              onChange={val => updateThreeDSettings({ solidColor: val })}
            />
          </div>
        )}

        {/* Max Points Cap */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Max Points Downsampling (per layer)
            </label>
            <span className="text-[10px] font-mono font-semibold text-primary">
              {(threeDSettings.maxPoints / 1000).toFixed(0)}
              k pts
            </span>
          </div>
          <Slider
            value={[threeDSettings.maxPoints]}
            min={20000}
            max={500000}
            step={10000}
            onValueChange={val => updateThreeDSettings({ maxPoints: val[0] })}
            className="py-1.5 cursor-pointer"
          />
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Maximum point count allowed per topic frame for performance optimization.
          </span>
        </div>

        {/* Scene Toggles */}
        <div className="pt-2 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">Reference Grid</span>
              <span className="text-[9px] text-muted-foreground/60 block">Show the 100x100m helper grid, independent of Grid topics</span>
            </div>
            <Switch
              checked={threeDSettings.showGrid}
              onCheckedChange={checked => updateThreeDSettings({ showGrid: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">Ego Axes Gizmo</span>
              <span className="text-[9px] text-muted-foreground/60 block">Show ROS coordinate axes at origin</span>
            </div>
            <Switch
              checked={threeDSettings.showAxes}
              onCheckedChange={checked => updateThreeDSettings({ showAxes: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
