import { useMcapStore } from '@/stores/mcap'

export default function TopicsTab() {
  const channels = useMcapStore(state => state.channels)
  const messageCounts = useMcapStore(state => state.messageCountsByTopic)
  const selectedTopic = useMcapStore(state => state.selectedTopic)
  const setSelectedTopic = useMcapStore(state => state.setSelectedTopic)
  const isLoaded = useMcapStore(state => state.isLoaded)

  if (!isLoaded) {
    return (
      <div className="p-4 text-center text-text-secondary text-xs italic select-none">
        No active MCAP stream loaded.
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="text-[10px] text-text-secondary font-medium tracking-wide mb-2.5">
        Available topics in current MCAP stream:
      </div>
      <div className="space-y-1.5">
        {channels.map((channel) => {
          const count = messageCounts[channel.topic] || 0
          const isSelected = selectedTopic === channel.topic

          return (
            <div
              key={channel.topic}
              onClick={() => setSelectedTopic(channel.topic)}
              className={`p-2 border transition-all rounded-[2px] cursor-pointer ${
                isSelected
                  ? 'border-layout-primary bg-layout-active text-text-main'
                  : 'bg-panel border-layout-border/80 hover:border-layout-primary/20 text-text-secondary hover:text-text-main'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-[10.5px] font-semibold truncate font-mono ${
                    isSelected ? 'text-layout-primary' : 'text-text-main'
                  }`}
                  title={channel.topic}
                >
                  {channel.topic}
                </span>
                <span className="text-[9px] bg-layout-hover text-text-secondary px-1 rounded-[2px] border border-layout-border/40 font-mono shrink-0">
                  {count}
                  {' '}
                  msgs
                </span>
              </div>
              <div className="text-[9px] font-mono mt-0.5 truncate flex justify-between gap-2" title={channel.schemaName}>
                <span className="truncate">{channel.schemaName}</span>
                <span className="text-[8px] text-text-secondary/70 shrink-0 uppercase">{channel.messageEncoding}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
