/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Standalone video server for deployed builds, e.g. https://my-mac.tail1234.ts.net */
  readonly VITE_VIDEO_API_URL?: string
}
