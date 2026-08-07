import type { ReactNode } from 'react'
import type { SupportedLocale } from '@/stores/use-locale-store'
import { IntlProvider } from 'react-intl'
import enUS from '@/locales/en-US.json'
import zhCN from '@/locales/zh-CN.json'
import { useLocaleStore } from '@/stores/use-locale-store'

const messagesMap: Record<SupportedLocale, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

interface I18nProviderProps {
  children: ReactNode
}

export default function I18nProvider({ children }: I18nProviderProps) {
  const locale = useLocaleStore(state => state.locale)
  const messages = messagesMap[locale] || enUS

  return (
    <IntlProvider locale={locale} defaultLocale="en-US" messages={messages}>
      {children}
    </IntlProvider>
  )
}
