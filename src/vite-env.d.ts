/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Enable plushie token trial (`/app/plushies`). Requires DB migration `game_tokens_trial`. */
  readonly VITE_GAME_TOKENS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
