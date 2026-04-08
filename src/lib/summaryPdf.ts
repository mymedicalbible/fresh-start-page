import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/** Result of rasterizing a DOM subtree for PDF embedding */
export type CapturedChart = {
  dataUrl: string
  width: number
  height: number
}

export type SummaryPdfCharts = {
  pain?: CapturedChart | null
  episode?: CapturedChart | null
}

export type SummaryPdfOptions = SummaryPdfCharts & {
  /** Full handoff region as shown in the app (charts + narrative); paginated in the PDF */
  visual?: CapturedChart | null
}

/** Match design tokens — rasterizers must not see unresolved `var(--*)` inside SVG. */
const TOKEN_BORDER = '#d4eadc'
const TOKEN_MUTED = '#6b7c72'
const TOKEN_MINT_INK = '#1e4d34'

/** Recharts root surface — html2canvas often clips or drops SVG; we rasterize this directly. */
const RECHARTS_SURFACE = 'svg.recharts-surface'

function sanitizeSvgSerialization (str: string): string {
  return str
    .replace(/var\(--border\)/g, TOKEN_BORDER)
    .replace(/var\(--muted\)/g, TOKEN_MUTED)
    .replace(/var\(--mint-ink\)/g, TOKEN_MINT_INK)
    /** Any remaining CSS variables would break blob→Image rasterization */
    .replace(/var\(--[a-zA-Z0-9-]+\)/g, TOKEN_MUTED)
}

function isInsideFixedAncestor (el: HTMLElement): boolean {
  let p: HTMLElement | null = el
  while (p) {
    if (getComputedStyle(p).position === 'fixed') return true
    p = p.parentElement
  }
  return false
}

type SvgDimRestore = { el: SVGElement; width: string | null; height: string | null; sw: string; sh: string }

/**
 * html2canvas needs explicit pixel width/height on SVG nodes; Recharts often uses % only.
 * Returns a restore function for the live DOM.
 */
function applySvgPixelDimensions (root: HTMLElement): () => void {
  const snaps: SvgDimRestore[] = []
  root.querySelectorAll('svg').forEach((node) => {
    const svg = node as SVGSVGElement
    const r = svg.getBoundingClientRect()
    const w = Math.max(1, Math.ceil(r.width))
    const h = Math.max(1, Math.ceil(r.height))
    snaps.push({
      el: svg,
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      sw: svg.style.width,
      sh: svg.style.height,
    })
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.style.width = `${w}px`
    svg.style.height = `${h}px`
  })
  return () => {
    snaps.forEach(({ el, width, height, sw, sh }) => {
      if (width === null) el.removeAttribute('width')
      else el.setAttribute('width', width)
      if (height === null) el.removeAttribute('height')
      else el.setAttribute('height', height)
      el.style.width = sw
      el.style.height = sh
    })
  }
}

async function isCaptureMostlyBlank (cap: CapturedChart): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const w = Math.min(480, img.naturalWidth || cap.width)
      const h = Math.min(480, img.naturalHeight || cap.height)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(true)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      let nonWhite = 0
      const step = 12
      for (let x = 0; x < w; x += step) {
        for (let y = 0; y < h; y += step) {
          const d = ctx.getImageData(x, y, 1, 1).data
          if (d[0] < 245 || d[1] < 245 || d[2] < 245) nonWhite++
        }
      }
      resolve(nonWhite < 4)
    }
    img.onerror = () => resolve(true)
    img.src = cap.dataUrl
  })
}

async function captureSvgToPng (svg: SVGSVGElement, scale = 2): Promise<CapturedChart | null> {
  try {
    const rect = svg.getBoundingClientRect()
    let w = Math.max(8, Math.round(rect.width))
    let h = Math.max(8, Math.round(rect.height))
    if (w < 16 || h < 16) {
      w = Math.max(w, svg.clientWidth || w)
      h = Math.max(h, svg.clientHeight || h)
    }
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    let str = new XMLSerializer().serializeToString(clone)
    str = sanitizeSvgSerialization(str)
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    return await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = w * scale
        canvas.height = h * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          resolve(null)
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    })
  } catch (e) {
    console.warn('SVG chart capture failed:', e)
    return null
  }
}

async function captureCardViaSvgFallback (card: HTMLElement): Promise<CapturedChart | null> {
  const svg = card.querySelector(RECHARTS_SURFACE) ?? card.querySelector(':scope svg')
  if (svg instanceof SVGSVGElement) return captureSvgToPng(svg, 2)
  return null
}

/**
 * Rasterize DOM for PDF. Recharts SVG is rasterized directly (html2canvas is unreliable for SVG).
 */
export async function captureElementAsPng (el: HTMLElement): Promise<CapturedChart | null> {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready
    }
    await new Promise<void>((r) => setTimeout(r, 50))

    const surfaces = el.querySelectorAll(RECHARTS_SURFACE)
    /**
     * Single chart *card* only: rasterize `recharts-surface` directly.
     * Do not use this for `.handoff-pdf-capture-root` (one chart + narrative would drop the text).
     */
    const chartCardOnly =
      el.classList.contains('card') &&
      surfaces.length === 1 &&
      !el.querySelector('.summary-readable')
    if (chartCardOnly) {
      const svgCap = await captureSvgToPng(surfaces[0] as SVGSVGElement, 2)
      if (svgCap && !(await isCaptureMostlyBlank(svgCap))) return svgCap
      const svgCap2 = await captureCardViaSvgFallback(el)
      if (svgCap2 && !(await isCaptureMostlyBlank(svgCap2))) return svgCap2
    }

    const restore = applySvgPixelDimensions(el)
    const fixed = isInsideFixedAncestor(el)
    /** Wrong scroll offsets against fixed overlays are a common cause of horizontal clipping. */
    const scrollX = fixed ? 0 : -window.scrollX
    const scrollY = fixed ? 0 : -window.scrollY

    const runHtml2 = (foreignObject: boolean) =>
      html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: foreignObject,
        scrollX,
        scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        onclone: (clonedDoc, clonedElement) => {
          const modalBody = clonedDoc.querySelector('.summary-modal-body')
          if (modalBody instanceof HTMLElement) {
            modalBody.style.overflow = 'visible'
            modalBody.style.maxHeight = 'none'
          }
          clonedElement.querySelectorAll('svg').forEach((node) => {
            const svg = node as SVGSVGElement
            const r = svg.getBoundingClientRect()
            const w = Math.max(1, Math.ceil(r.width))
            const h = Math.max(1, Math.ceil(r.height))
            svg.setAttribute('width', String(w))
            svg.setAttribute('height', String(h))
            svg.style.width = `${w}px`
            svg.style.height = `${h}px`
          })
        },
      })

    try {
      /** `foreignObjectRendering: false` usually rasterizes SVG more reliably than true. */
      let canvas = await runHtml2(false)
      let cap: CapturedChart = {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      }

      if (await isCaptureMostlyBlank(cap)) {
        canvas = await runHtml2(true)
        cap = {
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        }
      }

      if (await isCaptureMostlyBlank(cap)) {
        if (surfaces.length >= 1) {
          const svgCap = await captureSvgToPng(surfaces[0] as SVGSVGElement, 2)
          if (svgCap && !(await isCaptureMostlyBlank(svgCap))) return svgCap
        }
        if (el.classList.contains('card')) {
          const svgCap = await captureCardViaSvgFallback(el)
          if (svgCap && !(await isCaptureMostlyBlank(svgCap))) return svgCap
        }
        const innerCard = el.querySelector('.card')
        if (innerCard instanceof HTMLElement) {
          const svgCap = await captureCardViaSvgFallback(innerCard)
          if (svgCap && !(await isCaptureMostlyBlank(svgCap))) return svgCap
        }
        const anySvg = el.querySelector('svg')
        if (anySvg instanceof SVGSVGElement) {
          const svgCap = await captureSvgToPng(anySvg, 2)
          if (svgCap && !(await isCaptureMostlyBlank(svgCap))) return svgCap
        }
      }

      return cap
    } finally {
      restore()
    }
  } catch (err) {
    console.warn('captureElementAsPng failed:', err)
    return null
  }
}

/** Ink along one raster row — low values ≈ horizontal gap (good page-break point for screenshots). */
function rowInkScore (ctx: CanvasRenderingContext2D, w: number, y: number): number {
  const yy = Math.max(0, Math.min(Math.floor(y), ctx.canvas.height - 1))
  const d = ctx.getImageData(0, yy, w, 1).data
  let s = 0
  for (let x = 0; x < w; x += 4) {
    const i = x * 4
    if (d[i]! < 250 || d[i + 1]! < 250 || d[i + 2]! < 250) s++
  }
  return s
}

/**
 * Move the slice end **upward** only (never past `idealEndY`) to land on a low-ink row
 * so tall screenshots don’t shear through lines of text.
 */
function pickSliceEndY (
  ctx: CanvasRenderingContext2D,
  fullW: number,
  fullH: number,
  srcYpx: number,
  idealEndY: number,
): number {
  if (idealEndY <= srcYpx + 1) return Math.min(fullH, idealEndY)
  const span = idealEndY - srcYpx
  const searchRadius = Math.min(120, Math.max(28, span * 0.35))
  const yMin = Math.max(srcYpx + 2, Math.floor(idealEndY - searchRadius))
  const yMax = Math.min(fullH - 1, Math.ceil(idealEndY))
  if (yMin > yMax) return Math.min(fullH, idealEndY)

  const gapThreshold = Math.max(14, fullW * 0.006)
  const candidates: { y: number; score: number }[] = []
  for (let yy = yMin; yy <= yMax; yy++) {
    const score = rowInkScore(ctx, fullW, yy)
    if (score <= gapThreshold) candidates.push({ y: yy, score })
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => Math.abs(a.y - idealEndY) - Math.abs(b.y - idealEndY))
    return candidates[0]!.y
  }
  let bestY = idealEndY
  let bestScore = Infinity
  for (let yy = yMin; yy <= yMax; yy++) {
    const score = rowInkScore(ctx, fullW, yy)
    if (score < bestScore) {
      bestScore = score
      bestY = yy
    }
  }
  return Math.min(fullH, Math.max(srcYpx + 1, bestY))
}

/**
 * Wrap at spaces so `splitTextToSize` doesn’t split words mid-character; only overflow uses splitTextToSize.
 */
function wrapTextToLines (doc: jsPDF, text: string, maxW: number): string[] {
  const out: string[] = []
  const paragraphs = text.split(/\n/)
  for (const para of paragraphs) {
    if (para === '') {
      out.push('')
      continue
    }
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (doc.getTextWidth(candidate) <= maxW + 0.01) {
        line = candidate
      } else {
        if (line) out.push(line)
        if (doc.getTextWidth(word) <= maxW + 0.01) {
          line = word
        } else {
          const chunks = doc.splitTextToSize(word, maxW) as string[]
          for (let i = 0; i < chunks.length - 1; i++) out.push(chunks[i]!)
          line = chunks[chunks.length - 1] ?? ''
        }
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** Slice a tall bitmap across PDF pages */
async function addImagePaginated (
  doc: jsPDF,
  cap: CapturedChart,
  margin: number,
  pageH: number,
  maxW: number,
  startY: number,
): Promise<number> {
  const fullW = cap.width
  const fullH = cap.height
  const imgW = maxW
  const totalImgH = (fullH / fullW) * imgW

  return await new Promise<number>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const fullCanvas = document.createElement('canvas')
      fullCanvas.width = fullW
      fullCanvas.height = fullH
      const fctx = fullCanvas.getContext('2d')
      if (fctx) {
        fctx.fillStyle = '#ffffff'
        fctx.fillRect(0, 0, fullW, fullH)
        fctx.drawImage(img, 0, 0, fullW, fullH)
      }

      let y = startY
      let srcYpx = 0
      let remainingPt = totalImgH

      while (remainingPt > 0.5) {
        let room = pageH - margin - y
        if (room < 40) {
          doc.addPage()
          y = margin
          room = pageH - margin - y
        }
        const slicePt = Math.min(remainingPt, room)
        const sliceSrcHpx = (slicePt / imgW) * fullW
        const idealEndY = Math.min(fullH, srcYpx + sliceSrcHpx)
        const endY = fctx
          ? pickSliceEndY(fctx, fullW, fullH, srcYpx, idealEndY)
          : idealEndY
        let actualSrcH = Math.max(1, endY - srcYpx)
        if (srcYpx + actualSrcH > fullH) actualSrcH = fullH - srcYpx
        const actualSlicePt = (actualSrcH / fullW) * imgW

        const sc = document.createElement('canvas')
        sc.width = fullW
        sc.height = Math.max(1, Math.ceil(actualSrcH))
        const ctx = sc.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, sc.width, sc.height)
          ctx.drawImage(img, 0, srcYpx, fullW, actualSrcH, 0, 0, fullW, actualSrcH)
        }
        doc.addImage(sc.toDataURL('image/png'), 'PNG', margin, y, imgW, actualSlicePt)
        y += actualSlicePt + 8
        srcYpx += actualSrcH
        remainingPt -= actualSlicePt
        if (srcYpx >= fullH - 0.5) break
      }
      resolve(y)
    }
    img.onerror = () => resolve(startY)
    img.src = cap.dataUrl
  })
}

export async function downloadHealthSummaryPdf (
  body: string,
  generatedAtLabel: string,
  options?: SummaryPdfOptions,
) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const pageH = doc.internal.pageSize.getHeight()
  const maxW = doc.internal.pageSize.getWidth() - margin * 2
  let y = margin

  const addRawLines = (text: string, fontSize: number, color: [number, number, number], lineHeight: number) => {
    doc.setFontSize(fontSize)
    doc.setTextColor(...color)
    const lines = wrapTextToLines(doc, text, maxW)
    const textOpts = { baseline: 'top' as const }
    for (const line of lines) {
      if (y + lineHeight > pageH - margin) {
        doc.addPage()
        y = margin
      }
      if (line.length > 0) {
        doc.text(line, margin, y, textOpts)
      }
      y += lineHeight
    }
  }

  const addChartImage = (cap: CapturedChart) => {
    const ratio = cap.height / cap.width
    const w = maxW
    const h = maxW * ratio
    if (y + h > pageH - margin) {
      doc.addPage()
      y = margin
    }
    doc.addImage(cap.dataUrl, 'PNG', margin, y, w, h)
    y += h + 14
  }

  addRawLines('Clinical handoff summary', 16, [17, 24, 39], 20)
  y += 4
  addRawLines(`Prepared for discussion with a clinician · ${generatedAtLabel}`, 10, [75, 85, 99], 14)
  y += 12

  const visual = options?.visual
  const visualOk = Boolean(visual && !(await isCaptureMostlyBlank(visual)))

  if (visualOk && visual) {
    addRawLines('Summary as shown in the app (charts and narrative)', 11, [17, 24, 39], 16)
    y += 10
    y = await addImagePaginated(doc, visual, margin, pageH, maxW, y)
    y += 12
  }

  /** Chart cards use direct SVG rasterization; keep section for clarity + fallback if visual failed. */
  const painOk = options?.pain && !(await isCaptureMostlyBlank(options.pain))
  const epOk = options?.episode && !(await isCaptureMostlyBlank(options.episode))
  if (painOk || epOk) {
    addRawLines('Charts (from your logs)', 11, [17, 24, 39], 16)
    y += 8
    if (painOk) addChartImage(options.pain!)
    if (epOk) addChartImage(options.episode!)
    y += 4
  }

  if (!visualOk) {
    addRawLines(body, 11, [31, 41, 55], 15)
  }

  y += 8
  addRawLines(
    'Disclaimer: This summary was generated from information the patient entered in a personal health app. It is for communication only and is not a complete medical record, a legal document, or a substitute for professional clinical evaluation.',
    8,
    [107, 114, 128],
    12,
  )

  const safe = generatedAtLabel.replace(/[^\d]/g, '').slice(0, 8) || String(Date.now())
  doc.save(`clinical-handoff-summary-${safe}.pdf`)
}
