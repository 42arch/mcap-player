import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SupportedLocale = 'en-US' | 'zh-CN'

interface LocaleState {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    set => ({
      locale: 'en-US',
      setLocale: (locale: SupportedLocale) => set({ locale }),
    }),
    {
      name: 'mcapview-locale',
    },
  ),
)
