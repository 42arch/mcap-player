export default function ProblemsTab() {
  return (
    <div className="p-3">
      <div className="text-[10px] text-text-secondary font-medium tracking-wide mb-2.5">
        Active diagnostics problems:
      </div>
      <div className="space-y-1.5">
        <div className="p-2.5 bg-panel border border-layout-border hover:border-red-500/30 transition-all rounded-[2px] flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 shrink-0" />
          <div>
            <div className="text-[10.5px] font-semibold text-text-main font-mono">
              Planner Error: Obstacle proximity check failed.
            </div>
            <div className="text-[9px] text-text-secondary font-mono mt-0.5">
              Time: 105.5s | Source: Navigation Controller
            </div>
          </div>
        </div>

        <div className="p-2.5 bg-panel border border-layout-border hover:border-yellow-500/30 transition-all rounded-[2px] flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1 shrink-0" />
          <div>
            <div className="text-[10.5px] font-semibold text-text-main font-mono">
              Controller Warning: High motor temperature detected (74°C).
            </div>
            <div className="text-[9px] text-text-secondary font-mono mt-0.5">
              Time: 82.1s | Source: Motor Driver Node
            </div>
          </div>
        </div>

        <div className="p-2.5 bg-panel border border-layout-border hover:border-blue-500/30 transition-all rounded-[2px] flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
          <div>
            <div className="text-[10.5px] font-semibold text-text-main font-mono">
              Lidars Calibrated successfully.
            </div>
            <div className="text-[9px] text-text-secondary font-mono mt-0.5">
              Time: 31.0s | Source: Calibration Manager
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
