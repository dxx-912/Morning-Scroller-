import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Regenerate icons with `npm run icons` after editing public/favicon.svg.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { background: '#0b0b0d' } },
    apple: { ...minimal2023Preset.apple, padding: 0.3, resizeOptions: { background: '#0b0b0d' } },
  },
  images: ['public/favicon.svg'],
})
