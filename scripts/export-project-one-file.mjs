/**
 * One .txt file: app source + Supabase SQL + configs (no node_modules / dist / duplicate exports).
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
  '.yml',
  '.yaml',
  '.html',
  '.svg',
  '.webmanifest',
  '.mdc',
  '.example',
])

function shouldIncludeFile (relPosix, baseName) {
  if (baseName.endsWith('.map')) return false
  if (relPosix === '' || relPosix === '.') return false
  if (!relPosix.includes('/') && SKIP_ROOT_FILES.has(baseName)) return false
  if (relPosix.startsWith('supabase/.temp/')) return false
  const ext = path.extname(baseName)
  if (TEXT_EXT.has(ext)) return true
  if (baseName === 'Dockerfile' || baseName === 'Caddyfile') return true
  return false
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
  const safeStamp = stamp.slice(0, 19).replace(/[:T]/g, '-')
  const outDir = path.join(root, 'exports')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `project-code-and-sql-${safeStamp}.txt`)

  const chunks = []
  chunks.push(`Medical Bible Project — full code + SQL dump\n`)
  chunks.push(`Generated: ${stamp}\n`)
  chunks.push(`Root: ${root}\n`)
  chunks.push(`Files: ${files.length}\n`)
  chunks.push(`${'='.repeat(72)}\n`)

  for (const abs of files) {
    const rel = path.relative(root, abs).replace(/\\/g, '/')
    let body
    try {
      body = await fs.readFile(abs, 'utf8')
    } catch {
      body = '[Could not read file as UTF-8]\n'
    }
    chunks.push(`${'='.repeat(72)}`)
    chunks.push(`FILE: ${rel}`)
    chunks.push(`${'='.repeat(72)}\n`)
    chunks.push(body)
    if (!body.endsWith('\n')) chunks.push('\n')
    chunks.push('\n')
  }

  await fs.writeFile(outPath, chunks.join(''), 'utf8')
  console.log(`\n✓ Wrote ${files.length} files to:\n  ${outPath}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
