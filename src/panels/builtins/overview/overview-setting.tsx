import type { OverviewPanelConfig, PanelSettingsProps } from '@/panels/core/types'

export default function OverviewSetting(_props: PanelSettingsProps<OverviewPanelConfig>) {
  return (
    <div className="p-4 flex flex-col items-center justify-center text-center text-muted-foreground h-48 space-y-2 select-none">
      <span className="text-xs font-semibold">No Settings Available</span>
      <span className="text-[10px] text-muted-foreground/60 max-w-[200px] leading-relaxed">
        The Overview panel displays static metadata definitions and does not require runtime configurations.
      </span>
    </div>
  )
}
