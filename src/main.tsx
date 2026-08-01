import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/common/theme-provider'
import AppShell from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/app/globals.css'

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
