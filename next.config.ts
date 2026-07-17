import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@foxglove/wasm-lz4',
    '@foxglove/wasm-zstd',
    '@foxglove/wasm-bz2',
    '@mcap/support',
  ],
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    })

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      }
    }

    return config
  },
}

export default withNextIntl(nextConfig)
