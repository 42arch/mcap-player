import type { PanelSettingsProps, ThreeDPanelConfig } from '@/panels/core/types'
import { Eye, EyeOff } from 'lucide-react'
import { Suspense, useMemo } from 'react'
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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/stores/use-player-store'
import { useRegisteredSceneMessageAdapters } from './scene-message-adapter-registry'
import {
  discoverSceneLayers,
  getSceneLayerId,
  resolveSceneLayerSettings,
  useRegisteredSceneRenderers,
} from './scene-renderer-registry'

export default function ThreeDSetting({
  panelId,
  config: threeDSettings,
  updateConfig: updateThreeDSettings,
}: PanelSettingsProps<ThreeDPanelConfig>) {
  const channels = usePlayerStore(state => state.fileSummary?.channels)
  const sceneAdapters = useRegisteredSceneMessageAdapters()
  const sceneRenderers = useRegisteredSceneRenderers()
  const sceneLayers = useMemo(
    () => discoverSceneLayers(channels || [], sceneRenderers, sceneAdapters),
    [channels, sceneAdapters, sceneRenderers],
  )
  const selectedLayer = sceneLayers.find(
    layer => getSceneLayerId(layer.channel, layer.renderer.id) === threeDSettings.selectedLayerId,
  ) || sceneLayers[0] || null
  const selectedLayerId = selectedLayer
    ? getSceneLayerId(selectedLayer.channel, selectedLayer.renderer.id)
    : null
  const topicNames = sceneLayers.map(layer => layer.channel.topic)
  const isAnyVisible = topicNames.some(topic => threeDSettings.visibleTopics[topic] !== false)

  const selectLayer = (layerId: string, topic: string) => {
    updateThreeDSettings({ selectedLayerId: layerId, selectedTopic: topic })
  }

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

  const updateLayerSettings = (layerId: string, patch: Record<string, unknown>) => {
    updateThreeDSettings({
      layerSettings: {
        ...(threeDSettings.layerSettings || {}),
        [layerId]: {
          ...(threeDSettings.layerSettings?.[layerId] || {}),
          ...patch,
        },
      },
    })
  }

  const SelectedSettings = selectedLayer?.renderer.Settings
  const resolvedSelectedSettings = selectedLayer
    ? resolveSceneLayerSettings(selectedLayer.renderer, selectedLayer.channel, threeDSettings)
    : null

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col bg-card text-foreground">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              3D Layers (
              {sceneLayers.length}
              )
            </h3>
            {sceneLayers.length > 0
              ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setAllTopicsVisible(!isAnyVisible)}
                    title={isAnyVisible ? 'Hide all layers' : 'Show all layers'}
                  >
                    {isAnyVisible ? <Eye /> : <EyeOff />}
                  </Button>
                )
              : null}
          </div>

          <div className="flex max-h-60 flex-col gap-1 overflow-y-auto pr-1">
            {sceneLayers.length > 0
              ? sceneLayers.map(({ adapter, channel, renderer }) => {
                  const layerId = getSceneLayerId(channel, renderer.id)
                  const isSelected = layerId === selectedLayerId
                  const isVisible = threeDSettings.visibleTopics[channel.topic] !== false
                  return (
                    <div key={`${channel.id}:${layerId}`} className="flex items-center gap-1">
                      <Button
                        variant={isSelected ? 'secondary' : 'ghost'}
                        className={cn('h-auto min-w-0 flex-1 justify-start px-2 py-1.5', !isVisible && 'opacity-50')}
                        onClick={() => selectLayer(layerId, channel.topic)}
                      >
                        <span className="flex min-w-0 flex-col items-start gap-0.5">
                          <span className="w-full truncate font-mono text-xs" title={channel.topic}>
                            {channel.topic}
                          </span>
                          <span className="w-full truncate text-xs text-muted-foreground">
                            {renderer.title}
                            {adapter ? ` · ${adapter.title}` : ''}
                            {channel.schemaName ? ` · ${channel.schemaName}` : ''}
                          </span>
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleTopic(channel.topic)}
                        title={isVisible ? 'Hide layer' : 'Show layer'}
                      >
                        {isVisible ? <Eye /> : <EyeOff />}
                      </Button>
                    </div>
                  )
                })
              : <FieldDescription>No supported 3D layers were detected in this MCAP file.</FieldDescription>}
          </div>
        </section>

        {selectedLayer
          && (SelectedSettings || selectedLayer.renderer.supportsFrameOverride)
          && selectedLayerId
          && resolvedSelectedSettings
          ? (
              <>
                <Separator />
                <section className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-sm font-medium">{selectedLayer.renderer.title}</h3>
                    <p className="truncate font-mono text-xs text-muted-foreground" title={selectedLayer.channel.topic}>
                      {selectedLayer.channel.topic}
                    </p>
                  </div>
                  {selectedLayer.renderer.supportsFrameOverride
                    ? (
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor={`frame-override-${panelId}`}>Frame Override</FieldLabel>
                            <Input
                              id={`frame-override-${panelId}`}
                              value={typeof resolvedSelectedSettings.frameOverride === 'string'
                                ? resolvedSelectedSettings.frameOverride
                                : ''}
                              placeholder="Use message frame"
                              spellCheck={false}
                              onChange={event => updateLayerSettings(selectedLayerId, {
                                frameOverride: event.target.value,
                              })}
                            />
                            <FieldDescription>
                              Leave empty to use the frame supplied by the message adapter.
                            </FieldDescription>
                          </Field>
                        </FieldGroup>
                      )
                    : null}
                  {SelectedSettings
                    ? (
                        <Suspense fallback={<FieldDescription>Loading layer settings…</FieldDescription>}>
                          <SelectedSettings
                            adapter={selectedLayer.adapter}
                            channel={selectedLayer.channel}
                            layerId={selectedLayerId}
                            settings={resolvedSelectedSettings}
                            updateSettings={patch => updateLayerSettings(selectedLayerId, patch)}
                          />
                        </Suspense>
                      )
                    : null}
                </section>
              </>
            )
          : null}

        <Separator />

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Scene</h3>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`fixed-frame-${panelId}`}>Fixed Frame</FieldLabel>
              <Input
                id={`fixed-frame-${panelId}`}
                value={threeDSettings.fixedFrame || 'auto'}
                placeholder="auto"
                spellCheck={false}
                onBlur={(event) => {
                  if (!event.currentTarget.value.trim()) {
                    updateThreeDSettings({ fixedFrame: 'auto' })
                  }
                }}
                onChange={event => updateThreeDSettings({ fixedFrame: event.target.value })}
              />
              <FieldDescription>
                Use “auto” to derive the root from the transform graph, or enter an explicit frame ID.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Background Color</FieldLabel>
              <ColorPicker
                value={threeDSettings.backgroundColor || '#ffffff'}
                onChange={value => updateThreeDSettings({ backgroundColor: value })}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Reference Grid</FieldTitle>
                <FieldDescription>Show the scene helper grid independently of Grid topics.</FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Show reference grid"
                checked={threeDSettings.showGrid}
                onCheckedChange={checked => updateThreeDSettings({ showGrid: checked })}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Origin Axes</FieldTitle>
                <FieldDescription>Show coordinate axes at the fixed-frame origin.</FieldDescription>
              </FieldContent>
              <Switch
                aria-label="Show origin axes"
                checked={threeDSettings.showAxes}
                onCheckedChange={checked => updateThreeDSettings({ showAxes: checked })}
              />
            </Field>
          </FieldGroup>
        </section>
      </div>
    </div>
  )
}
