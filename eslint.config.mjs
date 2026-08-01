import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  react: true,
  rules: {
    'react-refresh/only-export-components': 'off',
    'react/static-components': 'off',
    'react/set-state-in-effect': 'off',
    'react/no-context-provider': 'off',
  },
  ignores: [
    'dist/**',
  ],
})
