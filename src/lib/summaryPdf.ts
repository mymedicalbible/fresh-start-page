import { jsPDF } from 'jspdf'

/** Download patient health handoff text as a PDF (Letter size, simple typography). */
export function downloadHealthSummaryPdf (body: string, generatedAtLabel: string) {
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

  addRawLines('Clinical handoff summary', 16, [17, 24, 39], 20)
  y += 4
  addRawLines(`Prepared for discussion with a clinician · ${generatedAtLabel}`, 10, [75, 85, 99], 14)
  y += 12

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
