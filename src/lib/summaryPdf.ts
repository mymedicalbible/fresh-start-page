import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/** Result of rasterizing a chart (or any) DOM node for PDF embedding */
export type CapturedChart = {
  dataUrl: string
  width: number
  height: number
}

/** Optional charts to embed after the header and before the narrative body */
export type SummaryPdfCharts = {
  pain?: CapturedChart | null
  episode?: CapturedChart | null
}

/**
 * Rasterize a DOM subtree (e.g. a Recharts card) for use in jsPDF.
 * Uses white background so grid/lines match print expectations.
 */
export async function captureElementAsPng (el: HTMLElement): Promise<CapturedChart | null> {
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    })
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    }
  } catch (err) {
    console.warn('Chart capture for PDF failed:', err)
    return null
  }
}

/** Download patient health handoff as PDF (Letter). Charts are optional raster images. */
export async function downloadHealthSummaryPdf (
  body: string,
  generatedAtLabel: string,
  charts?: SummaryPdfCharts,
) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const pageH = doc.internal.pageSize.getHeight()
  const pageW = doc.internal.pageSize.getWidth()
  const maxW = pageW - margin * 2
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

  const hasCharts = Boolean(charts?.pain || charts?.episode)
  if (hasCharts) {
    addRawLines('Charts (from your logs, same window as the summary)', 11, [17, 24, 39], 16)
    y += 8
    if (charts?.pain) addChartImage(charts.pain)
    if (charts?.episode) addChartImage(charts.episode)
    y += 4
  }

  addRawLines(body, 11, [31, 41, 55], 15)

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
