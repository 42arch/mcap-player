import { DatabaseIcon, InfoIcon } from '@phosphor-icons/react'
import { useMcapStore } from '@/stores/mcap'

export default function InspectorPanel() {
  const isLoaded = useMcapStore(state => state.isLoaded)
  const stats = useMcapStore(state => state.stats)

  if (!isLoaded || !stats) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary text-xs italic p-6 select-none bg-panel">
        <InfoIcon size={24} className="text-text-secondary/50 mb-2 animate-pulse" />
        <span>Please open an MCAP file to inspect its metadata summary.</span>
      </div>
    )
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0)
      return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
  }

  const metadata = [
    {
      category: 'File Summary',
      items: [
        { key: 'File Name', value: stats.name },
        { key: 'File Size', value: `${formatSize(stats.size)} (${stats.size.toLocaleString()} bytes)` },
        { key: 'Duration', value: stats.duration },
        { key: 'Start Time', value: stats.start },
        { key: 'End Time', value: stats.end },
      ],
    },
    {
      category: 'Stream Statistics',
      items: [
        { key: 'Message Count', value: stats.messageCount },
        { key: 'Channel Count', value: stats.channelsCount.toString() },
        { key: 'Schema Count', value: stats.schemasCount.toString() },
        { key: 'Chunk Count', value: stats.chunkCount.toString() },
        { key: 'Attachment Count', value: stats.attachmentCount.toString() },
        { key: 'Metadata Count', value: stats.metadataCount.toString() },
      ],
    },
  ]

  return (
    <div className="w-full h-full bg-panel text-text-main flex flex-col font-mono text-xs overflow-y-auto select-none">
      <div className="flex-1">
        {metadata.map((sec, sidx) => (
          <div key={sec.category} className={sidx > 0 ? 'border-t border-layout-border' : ''}>
            <div className="bg-titlebar/80 px-3 py-1.5 text-[10px] text-text-secondary uppercase tracking-wider font-bold border-b border-layout-border/30 flex items-center gap-1.5">
              {sec.category === 'File Summary' && <InfoIcon size={11} />}
              {sec.category === 'Stream Statistics' && <DatabaseIcon size={11} />}
              <span>{sec.category}</span>
            </div>
            <table className="w-full table-fixed divide-y divide-layout-border/30">
              <tbody className="divide-y divide-layout-border/20">
                {sec.items.map(item => (
                  <tr key={item.key} className="hover:bg-layout-hover/50 transition-colors">
                    <td className="w-2/5 px-3 py-1.5 text-text-secondary border-r border-layout-border/20 text-[11px] truncate" title={item.key}>
                      {item.key}
                    </td>
                    <td className="w-3/5 px-3 py-1.5 text-text-main text-[11px] font-semibold truncate select-text" title={item.value}>
                      {item.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
