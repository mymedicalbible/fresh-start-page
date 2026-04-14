#!/usr/bin/env node
/**
 * Runs `supabase db push` with SUPABASE_DB_PASSWORD from `.env`.
 * Without the password, the CLI often hangs on "Initialising login role..." (Management API login-role).
 * Password: Supabase Dashboard → Project Settings → Database → Database password (reset if unknown).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })
dotenv.config({ path: path.join(root, '.env.local'), override: true })

const pwd = process.env.SUPABASE_DB_PASSWORD?.trim()
if (!pwd) {
  console.error(
    'supabase-db-push: add SUPABASE_DB_PASSWORD to .env (Dashboard → Settings → Database → Database password).'
  )
  process.exit(1)
}

const r = spawnSync('supabase', ['db', 'push', '--yes'], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: { ...process.env, SUPABASE_DB_PASSWORD: pwd },
})
process.exit(r.status ?? 1)
