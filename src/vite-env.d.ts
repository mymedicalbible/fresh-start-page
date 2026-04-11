/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Set to `false` to disable plushie earns/RPCs. Omitted = enabled. Requires DB migration for data. */
  readonly VITE_GAME_TOKENS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
