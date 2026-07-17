import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Geist, Roboto } from 'next/font/google'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

const geistMono = localFont({
  src: '../../public/fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
})

const robotoHeading = Roboto({ subsets: ['latin'], variable: '--font-heading' })

export const metadata: Metadata = {
  title: 'MCAPVIEW',
  description: 'Real-time visualization of sensor data',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={cn('h-full', 'antialiased', geistMono.variable, 'font-sans', 'font-sans', geist.variable, robotoHeading.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
