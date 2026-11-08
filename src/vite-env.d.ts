/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string
/** Public production address (empty outside Vercel builds; then the current origin is used). */
declare const __PUBLIC_URL__: string

interface ImportMetaEnv {
  /** Standalone video server for deployed builds, e.g. https://my-mac.tail1234.ts.net */
  readonly VITE_VIDEO_API_URL?: string
  /** Set to "1" to turn logged-in video lookups back on. Off by default: they got an account flagged. */
  readonly VITE_VIDEO_LOOKUPS?: string
}
