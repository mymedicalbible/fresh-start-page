/**
 * ONE text file in exports/: ALL app source + Supabase SQL + configs (no node_modules / dist).
 * Output path is ALWAYS: exports/ALL_CODE_AND_SQL.txt (overwrite each run).
 * Run: npm run export:txt
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  '.git',
  'ExportedProject',
  'coverage',
  '.vite',
  'exports', // avoid embedding previous giant dumps
])

const SKIP_ROOT_FILES = new Set([
  'PROJECT_EXPORT.txt',
  'All_Medical_Project_Pages.txt',
  'all_pages.txt',
])

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.css',
  '.sql',
  '.toml',
  '.md',
  '.json',
  '.mjs',
  '.cjs',
  '.yml',
  '.yaml',
  '.html',
  '.svg',
  '.webmanifest',
  '.mdc',
  '.example',
])

/** Dotfiles and license at any depth (useful for restore / tooling). */
const EXTRA_NAMES = new Set([
  '.gitignore',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  'LICENSE',
  'LICENSE.md',
  'AGENTS.md',
])

function shouldIncludeFile (relPosix, baseName) {
  if (baseName.endsWith('.map')) return false
  if (relPosix === '' || relPosix === '.') return false
  if (!relPosix.includes('/') && SKIP_ROOT_FILES.has(baseName)) return false
  if (relPosix.startsWith('supabase/.temp/')) return false
  if (EXTRA_NAMES.has(baseName)) return true
  const ext = path.extname(baseName)
  if (TEXT_EXT.has(ext)) return true
  if (baseName === 'Dockerfile' || baseName === 'Caddyfile') return true
  return false
}

function buildFrontMatter (filesAbs) {
  const rels = filesAbs.map((a) => path.relative(root, a).replace(/\\/g, '/'))
  const migrations = rels.filter((r) => r.startsWith('supabase/migrations/') && r.endsWith('.sql')).sort()
  const supabaseLoose = rels.filter((r) => r.startsWith('supabase/') && r.endsWith('.sql') && !r.startsWith('supabase/migrations/')).sort()
  const plushieMigs = migrations.filter((r) =>
    /plushie|game_tokens|panda_popcorn|turtle|rotation_anchor|spotlight/i.test(r),
  )
  const lines = []
  lines.push('FRONT MATTER — SQL index + key topics (read this first)\n')
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('Regenerate: npm run export:txt → exports/ALL_CODE_AND_SQL.txt — see docs/full-project-export.md\n')
  lines.push('Plushie system (optional): docs/plushie-system-export.md (embedded later in this dump)\n')
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('Supabase Edge Functions in this repo:\n')
  lines.push('  push-reminders — web push reminders (cron uses x-cron-token header)\n')
  lines.push('  generate-summary — optional AI handoff polish\n')
  lines.push('  transcribe-visit — optional transcription flow\n')
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('Build-time (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY; web push: VITE_WEB_PUSH_PUBLIC_KEY\n')
  lines.push('Optional plush routes: VITE_GAME_TOKENS_ENABLED=true → /app/plushies, /app/plushies/mine\n')
  lines.push('Scripts/CI: SUPABASE_DB_PASSWORD (db push), PUSH_REMINDER_CRON_TOKEN (npm run push:run),\n')
  lines.push('  SUPABASE_SERVICE_ROLE_KEY (Playwright smoke setup only — never in frontend).\n')
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push(`All Supabase migrations in this dump (${migrations.length} files, apply in filename order):\n`)
  for (const m of migrations) lines.push(`  ${m}\n`)
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push(`Other Supabase SQL in this dump (${supabaseLoose.length}):\n`)
  for (const s of supabaseLoose) lines.push(`  ${s}\n`)
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push(`Plushie / game-token related migrations (${plushieMigs.length}):\n`)
  for (const p of plushieMigs) lines.push(`  ${p}\n`)
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('Public Lottie JSON paths (see docs/plushie-system-export.md): /lottie/*.json under public/lottie/\n')
  lines.push(`${'='.repeat(72)}\n\n`)
  return lines.join('')
}

async function collectFiles (dir, files, relBase = root) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    const rel = path.relative(relBase, full).replace(/\\/g, '/')
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      await collectFiles(full, files, relBase)
    } else if (shouldIncludeFile(rel, e.name)) {
      files.push(full)
    }
  }
}

async function main () {
  const files = []
  await collectFiles(root, files)
  files.sort((a, b) => a.localeCompare(b, 'en'))

  const stamp = new Date().toISOString()
  const outDir = path.join(root, 'exports')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'ALL_CODE_AND_SQL.txt')

  const chunks = []
  chunks.push(`Medical Bible Project — full code + SQL dump (ONE FILE)\n`)
  chunks.push(`Location: exports/ALL_CODE_AND_SQL.txt (this folder only)\n`)
  chunks.push(`Generated: ${stamp}\n`)
  chunks.push(`Root: ${root}\n`)
  chunks.push(`Files: ${files.length}\n`)
  chunks.push(`${'='.repeat(72)}\n`)
  chunks.push(buildFrontMatter(files))

  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/')
    let body
    try {
      body = await fs.readFile(abs, 'utf8')
    } catch {
      body = '[Could not read file as UTF-8]\n'
    }
    chunks.push(`${'='.repeat(72)}\n`)
    chunks.push(`FILE: ${rel}\n`)
    chunks.push(`${'='.repeat(72)}\n`)
    chunks.push(body)
    if (!body.endsWith('\n')) chunks.push('\n')
    chunks.push('\n')
  }

  await fs.writeFile(outPath, chunks.join(''), 'utf8')
  const abs = path.resolve(outPath)
  console.log(`\nWrote ${files.length} source files into ONE file:\n  ${abs}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
