import type { PanelSettingsProps, ThreeDPanelConfig } from '@/panels/core/types'
import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { usePlayerStore } from '@/stores/use-player-store'
import { HelpTooltip } from '../help-tooltip'
import { SettingGroup } from '../setting-group'
import PointCloudSetting from './point-cloud-setting'
import { useRegisteredSceneMessageAdapters } from './scene-message-adapter-registry'
import {
  discoverSceneLayers,
  getSceneLayerId,
  useRegisteredSceneRenderers,
} from './scene-renderer-registry'
import { getFrameIdsSnapshot, subscribeFrameIds } from './tf-frame-catalog'

const FOLLOW_MODES = [
  { value: 'follow-pose', label: 'Pose' },
  { value: 'follow-heading', label: 'Heading' },
  { value: 'follow-position', label: 'Position' },
  { value: 'follow-none', label: 'Off' },
] as const

function includeSelectedFrame(frameIds: readonly string[], selectedFrame: string): readonly string[] {
  if (!selectedFrame || selectedFrame === 'auto' || frameIds.includes(selectedFrame)) {
    return frameIds
  }
  return [...frameIds, selectedFrame].sort()
}

export default function ThreeDSetting({
  panelId,
  config: threeDSettings,
  updateConfig: updateThreeDSettings,
}: PanelSettingsProps<ThreeDPanelConfig>) {
  const channels = usePlayerStore(state => state.fileSummary?.channels)
  const sceneAdapters = useRegisteredSceneMessageAdapters()
  const sceneRenderers = useRegisteredSceneRenderers()
  const subscribeToFrameIds = useCallback(
    (listener: () => void) => subscribeFrameIds(panelId, listener),
    [panelId],
  )
  const getPanelFrameIdsSnapshot = useCallback(() => getFrameIdsSnapshot(panelId), [panelId])
  const availableFrameIds = useSyncExternalStore(
    subscribeToFrameIds,
    getPanelFrameIdsSnapshot,
    getPanelFrameIdsSnapshot,
  )
  const summaryFrameIds = usePlayerStore(state => state.fileSummary?.frameIds)
  const combinedFrameIds = useMemo(() => {
    const set = new Set([...(summaryFrameIds || []), ...availableFrameIds])
    return Array.from(set).sort()
  }, [summaryFrameIds, availableFrameIds])
  const fixedFrame = threeDSettings.fixedFrame || 'auto'
  const displayFrame = threeDSettings.displayFrame || 'map'
  const fixedFrameOptions = useMemo(
    () => includeSelectedFrame(combinedFrameIds, fixedFrame),
    [combinedFrameIds, fixedFrame],
  )
  const displayFrameOptions = useMemo(
    () => includeSelectedFrame(combinedFrameIds, displayFrame),
    [combinedFrameIds, displayFrame],
  )
  const sceneLayers = useMemo(
    () => discoverSceneLayers(channels || [], sceneRenderers, sceneAdapters),
    [channels, sceneAdapters, sceneRenderers],
  )
  const pointCloudLayer = sceneLayers.find(layer => layer.renderer.id === 'point-cloud')
  const topicNames = sceneLayers.map(layer => layer.channel.topic)
  const isAnyVisible = topicNames.some(topic => threeDSettings.visibleTopics[topic] !== false)

  const toggleTopic = (topic: string) => {
    updateThreeDSettings({
      visibleTopics: {
        ...threeDSettings.visibleTopics,
        [topic]: threeDSettings.visibleTopics[topic] === false,
      },
    })
  }

  const setAllTopicsVisible = (visible: boolean) => {
    updateThreeDSettings({
      visibleTopics: {
        ...threeDSettings.visibleTopics,
        ...Object.fromEntries(topicNames.map(topic => [topic, visible])),
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        {/* 3D Layers Group */}
        <SettingGroup
          title={`3D Layers (${sceneLayers.length})`}
          defaultOpen
          action={
            sceneLayers.length > 0
              ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setAllTopicsVisible(!isAnyVisible)}
                    title={isAnyVisible ? 'Hide all layers' : 'Show all layers'}
                  >
                    {isAnyVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </Button>
                )
              : null
          }
        >
          <div className="max-h-72 pr-1 overflow-y-auto">
            {sceneLayers.length > 0
              ? sceneLayers.map(({ channel, renderer }) => {
                  const layerId = getSceneLayerId(channel, renderer.id)
                  const isVisible = threeDSettings.visibleTopics[channel.topic] !== false
                  return (
                    <div
                      key={`${channel.id}:${layerId}`}
                      className="flex justify-between items-center gap-1 py-1 border-b border-border/30 last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-col items-start gap-0.5">
                        <span className="w-full truncate font-mono text-[10px]" title={channel.topic}>
                          {channel.topic}
                        </span>
                        <span className="w-full truncate text-[9px] text-muted-foreground">
                          {channel.schemaName}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleTopic(channel.topic)}
                        title={isVisible ? 'Hide layer' : 'Show layer'}
                      >
                        {isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </Button>
                    </div>
                  )
                })
              : <FieldDescription>No supported 3D layers were detected in this MCAP file.</FieldDescription>}
          </div>
        </SettingGroup>

        {/* Global Point Cloud Settings Group */}
        {pointCloudLayer
          ? (
              <SettingGroup title="Point Cloud Settings" defaultOpen>
                <PointCloudSetting
                  adapter={pointCloudLayer.adapter}
                  channel={pointCloudLayer.channel}
                  layerId="global"
                  settings={threeDSettings}
                  updateSettings={patch => updateThreeDSettings(patch)}
                />
              </SettingGroup>
            )
          : null}

        {/* Frame Settings Group */}
        <SettingGroup title="Frame Settings" defaultOpen>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`fixed-frame-${panelId}`} className="flex items-center">
                Fixed Frame
                <HelpTooltip content="Use Auto to derive the TF root, or choose any available frame." />
              </FieldLabel>
              <Select value={fixedFrame} onValueChange={value => updateThreeDSettings({ fixedFrame: value })}>
                <SelectTrigger id={`fixed-frame-${panelId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    <SelectItem value="auto">Auto</SelectItem>
                    {fixedFrameOptions.map(frameId => (
                      <SelectItem key={frameId} value={frameId}>{frameId}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`display-frame-${panelId}`} className="flex items-center">
                Display Frame
                <HelpTooltip content="Camera reference frame. Options are discovered from the active TF tree." />
              </FieldLabel>
              <Select value={displayFrame} onValueChange={value => updateThreeDSettings({ displayFrame: value })}>
                <SelectTrigger id={`display-frame-${panelId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {displayFrameOptions.map(frameId => (
                      <SelectItem key={frameId} value={frameId}>{frameId}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`follow-mode-${panelId}`} className="flex items-center">
                Follow Mode
                <HelpTooltip content="Choose whether the viewport follows pose, heading, position, or remains fixed." />
              </FieldLabel>
              <Select
                value={threeDSettings.followMode || 'follow-position'}
                onValueChange={value => updateThreeDSettings({
                  followMode: value as ThreeDPanelConfig['followMode'],
                })}
              >
                <SelectTrigger id={`follow-mode-${panelId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FOLLOW_MODES.map(mode => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </SettingGroup>

        {/* Scene Settings Group */}
        <SettingGroup title="Scene Settings" defaultOpen>
          <FieldGroup>
            <Field>
              <FieldLabel>Background Color</FieldLabel>
              <ColorPicker
                value={threeDSettings.backgroundColor || '#ffffff'}
                onChange={value => updateThreeDSettings({ backgroundColor: value })}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle className="flex items-center">
                  Reference Grid
                  <HelpTooltip content="Show the scene helper grid independently of Grid topics." />
                </FieldTitle>
              </FieldContent>
              <Switch
                aria-label="Show reference grid"
                checked={threeDSettings.showGrid}
                onCheckedChange={checked => updateThreeDSettings({ showGrid: checked })}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle className="flex items-center">
                  Origin Axes
                  <HelpTooltip content="Show coordinate axes at the fixed-frame origin." />
                </FieldTitle>
              </FieldContent>
              <Switch
                aria-label="Show origin axes"
                checked={threeDSettings.showAxes}
                onCheckedChange={checked => updateThreeDSettings({ showAxes: checked })}
              />
            </Field>
          </FieldGroup>
        </SettingGroup>
      </div>
    </div>
  )
}
