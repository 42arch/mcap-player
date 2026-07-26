import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { globalPlaybackController } from '@/core/playback-controller'
import { usePlayerStore } from '@/stores/use-player-store'

export default function ThreeDSetting() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const threeDSettings = usePlayerStore(state => state.threeDSettings)
  const updateThreeDSettings = usePlayerStore(state => state.updateThreeDSettings)
  const toggleTopicVisibility = usePlayerStore(state => state.toggleTopicVisibility)
  const setAllTopicsVisibility = usePlayerStore(state => state.setAllTopicsVisibility)
  const subscribedTopics = usePlayerStore(state => state.subscribedTopics)

  // Filter channels for potential 3D PointCloud and SceneUpdate (Marker) topics
  const spatial3DTopics = (fileSummary?.channels || [])
    .filter((ch) => {
      const name = (ch.schemaName || '').toLowerCase()
      const t = ch.topic.toLowerCase()
      return (
        name.includes('pointcloud')
        || name.includes('point_cloud')
        || name.includes('foxglove.pointcloud')
        || name.includes('sceneupdate')
        || name.includes('foxglove.sceneupdate')
        || t.includes('pointcloud')
        || t.includes('points')
        || t.includes('lidar')
        || t.includes('marker')
        || t.includes('annotation')
      )
    })

  const topicNames = spatial3DTopics.map(ch => ch.topic)

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
              <span className="text-xs font-semibold text-foreground block">Ground Grid</span>
              <span className="text-[9px] text-muted-foreground/60 block">Show 100x100m reference grid</span>
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
