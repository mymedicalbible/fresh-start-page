/**
 * THREE text files in exports/: ALL app source + Supabase SQL + configs (no node_modules / dist).
 * Output paths: exports/1.txt, exports/2.txt, exports/3.txt (overwritten each run).
 * Part 1 holds the migration index / front matter; parts 2–3 continue the same FILE: sections.
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
  'exports',
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
  lines.push('Regenerate: npm run export:txt → exports/1.txt, 2.txt, 3.txt — see docs/full-project-export.md\n')
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

/** Append FILE: sections for a slice of absolute paths. */
async function appendFileSections (chunks, absFiles) {
  for (const abs of absFiles) {
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
}

function splitIntoThree (sortedAbs) {
  const n = sortedAbs.length
  const i1 = Math.ceil(n / 3)
  const i2 = Math.ceil((2 * n) / 3)
  return [
    sortedAbs.slice(0, i1),
    sortedAbs.slice(i1, i2),
    sortedAbs.slice(i2),
  ]
}

function relPath (abs) {
  return path.relative(root, abs).replace(/\\/g, '/')
}

/** First and last path in a slice (sorted paths = alphabetical). */
function spanLabel (sliceAbs) {
  if (sliceAbs.length === 0) return { first: '(none)', last: '(none)' }
  return { first: relPath(sliceAbs[0]), last: relPath(sliceAbs[sliceAbs.length - 1]) }
}

function buildReadOrderGuide (total, part1, part2, part3) {
  const s1 = spanLabel(part1)
  const s2 = spanLabel(part2)
  const s3 = spanLabel(part3)
  const lines = []
  lines.push('READ ORDER — FOR REVIEW (e.g. ChatGPT, auditors)\n')
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('The repo is split into 3 text files. Read them in order: 1.txt → 2.txt → 3.txt.\n')
  lines.push('Files are listed in **alphabetical path order** (same order in every run).\n')
  lines.push(`Excluded from this dump: node_modules, dist, .git, exports, caches, non-text binaries.\n`)
  lines.push(`Total embedded files: ${total}\n`)
  lines.push(`${'─'.repeat(72)}\n`)
  lines.push('WHAT IS IN EACH FILE\n')
  lines.push(`\n`)
  lines.push(`  [1.txt]  Migration/SQL index + env/Edge notes (below), then ${part1.length} files:\n`)
  lines.push(`           from: ${s1.first}\n`)
  lines.push(`           to:   ${s1.last}\n`)
  lines.push(`\n`)
  lines.push(`  [2.txt]  Part 2 of 3 — ${part2.length} files:\n`)
  lines.push(`           from: ${s2.first}\n`)
  lines.push(`           to:   ${s2.last}\n`)
  lines.push(`\n`)
  lines.push(`  [3.txt]  Part 3 of 3 — ${part3.length} files:\n`)
  lines.push(`           from: ${s3.first}\n`)
  lines.push(`           to:   ${s3.last}\n`)
  lines.push(`${'='.repeat(72)}\n\n`)
  return lines.join('')
}

async function main () {
  const files = []
  await collectFiles(root, files)
  files.sort((a, b) => a.localeCompare(b, 'en'))

  const stamp = new Date().toISOString()
  const outDir = path.join(root, 'exports')
  await fs.mkdir(outDir, { recursive: true })

  const legacyPath = path.join(outDir, 'ALL_CODE_AND_SQL.txt')
  try {
    await fs.unlink(legacyPath)
  } catch {
    /* ignore if missing */
  }

  const [part1, part2, part3] = splitIntoThree(files)
  const names = ['1.txt', '2.txt', '3.txt']
  const parts = [part1, part2, part3]

  const written = []

  const readOrderBlock = buildReadOrderGuide(files.length, part1, part2, part3)

  for (let i = 0; i < 3; i++) {
    const chunks = []
    const num = i + 1
    const sp = spanLabel(parts[i])
    chunks.push(`TITLE: ${num} of 3 — Medical Bible Project (full text export)\n`)
    chunks.push(`File: exports/${names[i]}\n`)
    chunks.push(`Generated (UTC): ${stamp}\n`)
    chunks.push(`Project root: ${root}\n`)
    chunks.push(`Embedded in this .txt: ${parts[i].length} files | Full export: ${files.length} files total\n`)
    chunks.push(`Path span (alphabetical): ${sp.first}  →  ${sp.last}\n`)
    chunks.push(`${'='.repeat(72)}\n`)

    if (i === 0) {
      chunks.push(readOrderBlock)
      chunks.push(buildFrontMatter(files))
    } else {
      chunks.push(
        `PART ${num} OF 3 — CONTINUATION\n`,
        `${'─'.repeat(72)}\n`,
        `Start with exports/1.txt for the READ ORDER guide, migration list, and env/Edge notes.\n`,
        `This file continues the concatenation: paths from "${sp.first}" through "${sp.last}".\n\n`,
      )
    }

    await appendFileSections(chunks, parts[i])

    const outPath = path.join(outDir, names[i])
    await fs.writeFile(outPath, chunks.join(''), 'utf8')
    written.push(path.resolve(outPath))
  }

  console.log(`\nWrote ${files.length} source files into THREE files:\n`)
  for (const p of written) console.log(`  ${p}`)
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
