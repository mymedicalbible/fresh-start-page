/**
 * Creates one .zip of your project source (everything Git tracks).
 * Untracked / ignored files are NOT included — commit or `git add` first if needed.
 *
 * Run: npm run export
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const outName = `medical-bible-code-export-${stamp}.zip`

try {
  execSync(`git archive --format=zip -o "${outName}" HEAD`, { stdio: 'inherit' })
  console.log(`\n✓ Export created: ${join(root, outName)}`)
} catch {
  console.error(
    '\n✗ git archive failed. From the project folder, try:\n',
    '  git archive --format=zip -o export.zip HEAD\n',
    '\nOr install Git and ensure this folder is a Git repository.\n',
  )
  process.exit(1)
}
