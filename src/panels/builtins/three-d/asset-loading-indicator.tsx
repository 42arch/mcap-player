import type { AssetLoadTracker } from './asset-load-tracker'
import { useSyncExternalStore } from 'react'
import { Spinner } from '@/components/ui/spinner'

export function AssetLoadingIndicator({
  isLightBackground,
  tracker,
}: {
  isLightBackground: boolean
  tracker: AssetLoadTracker
}) {
  const snapshot = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot)

  if (snapshot.activeCount === 0) {
    return null
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label={`Loading asset ${snapshot.currentLabel}`}
      className={`pointer-events-none absolute right-3 bottom-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border px-3 py-2 shadow-md backdrop-blur-md ${
        isLightBackground
          ? 'border-slate-200/80 bg-white/90 text-slate-800 shadow-slate-200/50'
          : 'border-slate-700/80 bg-slate-950/85 text-slate-100 shadow-slate-950/50'
      }`}
    >
      <Spinner className={isLightBackground ? 'text-blue-600' : 'text-cyan-400'} />
      <span className={`shrink-0 text-[10px] font-medium ${isLightBackground ? 'text-slate-500' : 'text-slate-400'}`}>
        Loading
      </span>
      <span className="max-w-52 truncate font-mono text-[10px]" title={snapshot.currentLabel}>
        {snapshot.currentLabel}
      </span>
    </aside>
  )
}
