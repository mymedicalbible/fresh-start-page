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

async function isCaptureMostlyBlank (cap: CapturedChart): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const w = Math.min(320, img.naturalWidth || cap.width)
      const h = Math.min(320, img.naturalHeight || cap.height)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(true)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      let nonWhite = 0
      const step = 16
      for (let x = 0; x < w; x += step) {
        for (let y = 0; y < h; y += step) {
          const d = ctx.getImageData(x, y, 1, 1).data
          if (d[0] < 245 || d[1] < 245 || d[2] < 245) nonWhite++
        }
      }
      resolve(nonWhite < 6)
    }
    img.onerror = () => resolve(true)
    img.src = cap.dataUrl
  })
}

async function captureSvgToPng (svg: SVGSVGElement, scale = 2): Promise<CapturedChart | null> {
  try {
    const rect = svg.getBoundingClientRect()
    const w = Math.max(8, Math.round(rect.width))
    const h = Math.max(8, Math.round(rect.height))
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    clone.removeAttribute('style')
    let str = new XMLSerializer().serializeToString(clone)
    str = str
      .replace(/var\(--border\)/g, TOKEN_BORDER)
      .replace(/var\(--muted\)/g, TOKEN_MUTED)
      .replace(/var\(--mint-ink\)/g, TOKEN_MINT_INK)
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
  const svg = card.querySelector(':scope svg')
  if (svg instanceof SVGSVGElement) return captureSvgToPng(svg, 2)
  return null
}

/**
 * Rasterize DOM for PDF. Tries html2canvas; if the result is blank, exports the Recharts SVG directly.
 */
export async function captureElementAsPng (el: HTMLElement): Promise<CapturedChart | null> {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready
    }
    await new Promise<void>((r) => setTimeout(r, 100))

    const runHtml2 = (foreignObject: boolean) =>
      html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: foreignObject,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        /** Modal scroll containers can clip SVG/raster; expand in the clone only. */
        onclone: (clonedDoc) => {
          const modalBody = clonedDoc.querySelector('.summary-modal-body')
          if (modalBody instanceof HTMLElement) {
            modalBody.style.overflow = 'visible'
            modalBody.style.maxHeight = 'none'
          }
        },
      })

    let canvas = await runHtml2(true)
    let cap: CapturedChart = {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    }

    if (await isCaptureMostlyBlank(cap)) {
      canvas = await runHtml2(false)
      cap = {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      }
    }

    if (await isCaptureMostlyBlank(cap)) {
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
  } catch (err) {
    console.warn('captureElementAsPng failed:', err)
    return null
  }
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

        const sc = document.createElement('canvas')
        sc.width = fullW
        sc.height = Math.max(1, Math.ceil(sliceSrcHpx))
        const ctx = sc.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, sc.width, sc.height)
          ctx.drawImage(img, 0, srcYpx, fullW, sliceSrcHpx, 0, 0, fullW, sliceSrcHpx)
        }
        doc.addImage(sc.toDataURL('image/png'), 'PNG', margin, y, imgW, slicePt)
        y += slicePt + 8
        srcYpx += sliceSrcHpx
        remainingPt -= slicePt
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
    const lines = doc.splitTextToSize(text, maxW)
    for (const line of lines) {
      if (y + lineHeight > pageH - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
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

  /** Always embed chart captures when present and non-blank — full-handoff html2canvas often omits Recharts SVG. */
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
