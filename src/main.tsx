import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/common/theme-provider'
import I18nProvider from '@/components/i18n-provider'
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
        <I18nProvider>
          <TooltipProvider>
            <AppShell />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
