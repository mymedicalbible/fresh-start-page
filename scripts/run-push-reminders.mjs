#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })
dotenv.config({ path: path.join(root, '.env.local'), override: true })

const url = String(process.env.VITE_SUPABASE_URL ?? '').trim()
const token = String(process.env.PUSH_REMINDER_CRON_TOKEN ?? '').trim()
if (!url) {
  console.error('Missing VITE_SUPABASE_URL in .env')
  process.exit(1)
}
if (!token) {
  console.error('Missing PUSH_REMINDER_CRON_TOKEN in .env')
  process.exit(1)
}

const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/push-reminders`
const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-cron-token': token,
  },
  body: JSON.stringify({ trigger: 'manual-script' }),
})
const text = await res.text()
if (!res.ok) {
  console.error(`push-reminders failed (${res.status}): ${text}`)
  process.exit(1)
}
console.log(text)

