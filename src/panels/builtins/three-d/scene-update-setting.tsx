import type { SceneLayerSettingsProps } from './scene-renderer-registry'
import { Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { collectSceneLabelFields } from '@/core/parsers/scene-labels'
import { globalPlaybackController } from '@/core/playback-controller'
import { adaptSceneMessage } from './scene-message-adapter-registry'

export default function SceneUpdateSetting({ adapter, channel, settings, updateSettings }: SceneLayerSettingsProps) {
  const [fields, setFields] = useState<string[] | null>(null)
  const selectedFields = Array.isArray(settings.labelFields)
    ? settings.labelFields.filter((field): field is string => typeof field === 'string')
    : []

  useEffect(() => {
    let isCancelled = false
    setFields(null)
    globalPlaybackController.getFirstMessagePayload(channel.topic)
      .then((payload) => {
        if (!isCancelled) {
          const adapted = adaptSceneMessage(adapter, payload, channel)
          setFields(collectSceneLabelFields(adapted.payload))
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFields([])
        }
      })
    return () => {
      isCancelled = true
    }
  }, [adapter, channel])

  const toggleField = (field: string) => {
    updateSettings({
      labelFields: selectedFields.includes(field)
        ? selectedFields.filter(value => value !== field)
        : [...selectedFields, field],
    })
  }

  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">
        <Tags />
        Annotation Labels
      </FieldLegend>
      <FieldDescription>
        Combine entity fields into labels rendered above SceneUpdate geometry.
      </FieldDescription>

      {fields === null
        ? <FieldDescription>Reading available fields…</FieldDescription>
        : fields.length > 0
          ? (
              <div className="flex flex-wrap gap-2">
                {fields.map(field => (
                  <Button
                    key={field}
                    type="button"
                    variant={selectedFields.includes(field) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleField(field)}
                    aria-pressed={selectedFields.includes(field)}
                  >
                    {field}
                  </Button>
                ))}
              </div>
            )
          : <FieldDescription>No label-compatible entity fields were detected.</FieldDescription>}
    </FieldSet>
  )
}
