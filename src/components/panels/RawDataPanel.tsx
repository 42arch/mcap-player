import { DatabaseIcon, InfoIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDecodedPayload } from '@/lib/mcap/decoder'
import { findActiveMessage, useMcapStore } from '@/stores/mcap'

export default function RawDataPanel() {
  const isLoaded = useMcapStore(state => state.isLoaded)
  const channels = useMcapStore(state => state.channels)
  const selectedTopic = useMcapStore(state => state.selectedTopic)
  const setSelectedTopic = useMcapStore(state => state.setSelectedTopic)
  const messagesByTopic = useMcapStore(state => state.messagesByTopic)
  const startNs = useMcapStore(state => state.startNs)
  const elapsedSeconds = useMcapStore(state => state.elapsedSeconds)
  const ros2Definitions = useMcapStore(state => state.ros2Definitions)
  const protobufDefinitions = useMcapStore(state => state.protobufDefinitions)

  // Find the active message for the selected topic at the current playback time
  const activeMessage = useMemo(() => {
    if (!selectedTopic || !messagesByTopic[selectedTopic])
      return null
    const topicMsgs = messagesByTopic[selectedTopic]
    const currentTimeNs = startNs + BigInt(Math.round(elapsedSeconds * 1e9))
    return findActiveMessage(topicMsgs, currentTimeNs)
  }, [selectedTopic, messagesByTopic, startNs, elapsedSeconds])

  // Get decoded payload text using getDecodedPayload helper
  const decodedPayloadText = useMemo(() => {
    if (!activeMessage)
      return ''
    return getDecodedPayload(activeMessage, ros2Definitions, protobufDefinitions)
  }, [activeMessage, ros2Definitions, protobufDefinitions])

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary text-xs italic p-6 select-none bg-panel">
        <DatabaseIcon size={24} className="text-text-secondary/50 mb-2 animate-pulse" />
        <span>Please open an MCAP file first to inspect message streams.</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-panel text-text-main flex flex-col overflow-hidden select-none font-sans text-xs">
      {/* Panel Selector Control Bar */}
      <div className="p-3 border-b border-layout-border bg-titlebar/40 space-y-2 shrink-0">
        <div className="space-y-1">
          <label htmlFor="topic-select" className="text-[9px] text-text-secondary font-mono tracking-wider block">
            INSPECT TOPIC CHANNEL
          </label>
          <Select value={selectedTopic} onValueChange={setSelectedTopic}>
            <SelectTrigger className="w-full bg-panel border-layout-border text-xs text-layout-primary font-mono px-3 py-1.5 h-8 rounded-none">
              <SelectValue placeholder="Select a topic to inspect..." />
            </SelectTrigger>
            <SelectContent className="bg-panel border-layout-border text-text-main font-mono text-xs max-h-60 rounded-none">
              {channels.map(c => (
                <SelectItem
                  key={c.id}
                  value={c.topic}
                  className="hover:bg-layout-hover hover:text-layout-primary focus:bg-layout-hover focus:text-layout-primary cursor-pointer rounded-none"
                >
                  {c.topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeMessage
          ? (
              <Card className="bg-titlebar/30 border-layout-border rounded-none shadow-xs">
                <CardContent className="p-2 space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between items-center text-text-secondary">
                    <span>
                      SEQ:
                      <strong className="text-text-main ml-1">{activeMessage.sequence}</strong>
                    </span>
                    <span>
                      ENCODING:
                      <strong className="text-text-main ml-1">{activeMessage.encoding}</strong>
                    </span>
                  </div>
                  <div className="text-text-secondary truncate" title={activeMessage.schemaName}>
                    SCHEMA:
                    {' '}
                    <strong className="text-text-main">{activeMessage.schemaName}</strong>
                  </div>
                  <div className="text-text-secondary">
                    TIME:
                    {' '}
                    <strong className="text-layout-primary">{activeMessage.logTime}</strong>
                  </div>
                </CardContent>
              </Card>
            )
          : (
              <div className="bg-titlebar/10 rounded-none border border-dashed border-layout-border p-2 text-center text-xs text-text-secondary italic">
                No active message on this topic at the current playhead timestamp.
              </div>
            )}
      </div>

      {/* Decoded Content scroll area */}
      <div className="flex-1 overflow-y-auto p-3 bg-panel/30">
        {activeMessage
          ? (
              <div className="h-full flex flex-col space-y-1.5">
                <span className="text-[9px] text-text-secondary font-mono uppercase tracking-wider block">
                  Decoded Payload
                </span>
                <div className="flex-1 bg-workbench border border-layout-border rounded-none p-2.5 font-mono text-[10.5px] overflow-auto select-text">
                  <pre className="text-text-main whitespace-pre-wrap break-all leading-normal">
                    {decodedPayloadText}
                  </pre>
                </div>
              </div>
            )
          : (
              <div className="h-full flex flex-col items-center justify-center text-text-secondary text-xs italic space-y-2 p-6 text-center select-none">
                <InfoIcon size={20} className="text-text-secondary/40" />
                <span>Select a topic channel and play or scrub the timeline to inspect decoded telemetry value properties.</span>
              </div>
            )}
      </div>
    </div>
  )
}
