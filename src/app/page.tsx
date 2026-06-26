'use client'

import AppShell from '@/components/layout/AppShell'
import { registerAllPanels } from '@/components/panels/register-panels'

// Register all panels at module level
registerAllPanels()

export default function Home() {
  return <AppShell />
}
