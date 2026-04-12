/**
 * Removes edge-connected background: near-white (typical paper) and/or near-black (typical export matte).
 * Preserves non-edge-connected regions of similar color (e.g. flower centers, line art).
 *
 * First run: copies public/more-grass-footer.png → more-grass-footer.source.png
 * then writes processed PNG to more-grass-footer.png. Re-runs always read from .source.png.
 */
import sharp from 'sharp'
import { copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')
const outPath = join(publicDir, 'more-grass-footer.png')
const srcPath = join(publicDir, 'more-grass-footer.source.png')

/** Light background / paper white; keeps saturated colors (grass, orange flowers). */
function isNearWhite (r, g, b) {
  if (r < 225 || g < 225 || b < 225) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max - min) < 45
}

/** Dark matte (e.g. black export background); uniform low RGB — matched pixels become transparent, not kept. */
function isNearBlack (r, g, b) {
  if (r > 56 || g > 56 || b > 56) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max - min) < 52
}

/**
 * @param {Buffer} data
 * @param {number} w
 * @param {number} h
 * @param {number} ch
 * @param {(r: number, g: number, b: number) => boolean} match
 * @param {{ top: boolean, left: boolean, right: boolean, bottom: boolean }} edges
 */
function floodEdgeToTransparent (data, w, h, ch, match, edges) {
  const visited = new Uint8Array(w * h)
  const stack = []

  const pix = (x, y) => y * w + x
  const offset = (x, y) => (y * w + x) * ch

  function tryPush (x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const p = pix(x, y)
    if (visited[p]) return
    const o = offset(x, y)
    if (data[o + 3] === 0) return
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    if (!match(r, g, b)) return
    visited[p] = 1
    stack.push(x, y)
  }

  if (edges.top) {
    for (let x = 0; x < w; x++) tryPush(x, 0)
  }
  if (edges.bottom) {
    for (let x = 0; x < w; x++) tryPush(x, h - 1)
  }
  if (edges.left) {
    for (let y = 0; y < h; y++) tryPush(0, y)
  }
  if (edges.right) {
    for (let y = 0; y < h; y++) tryPush(w - 1, y)
  }

  while (stack.length) {
    const y = stack.pop()
    const x = stack.pop()
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const p = pix(nx, ny)
      if (visited[p]) continue
      const o = offset(nx, ny)
      if (data[o + 3] === 0) continue
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      if (!match(r, g, b)) continue
      visited[p] = 1
      stack.push(nx, ny)
    }
  }

  for (let i = 0; i < visited.length; i++) {
    if (!visited[i]) continue
    const o = i * ch
    data[o + 3] = 0
  }
}

async function main () {
  if (!existsSync(outPath)) {
    console.error('Missing', outPath)
    process.exit(1)
  }
  if (!existsSync(srcPath)) {
    await copyFile(outPath, srcPath)
    console.log('Created backup source:', srcPath)
  }

  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = 4

  // Near-white matte: top + left + right only (keeps bottom grass row if margin is white below art)
  floodEdgeToTransparent(data, w, h, ch, isNearWhite, { top: true, left: true, right: true, bottom: false })
  // Near-black matte: all edges (typical full-frame black export)
  floodEdgeToTransparent(data, w, h, ch, isNearBlack, { top: true, left: true, right: true, bottom: true })

  await sharp(Buffer.from(data), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(outPath)

  console.log('Wrote transparent PNG:', outPath, `(${w}×${h})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
