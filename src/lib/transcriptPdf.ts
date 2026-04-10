import jsPDF from 'jspdf'

export function downloadTranscriptPdf (transcript: string, doctorName: string, visitDate: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const pageWidth = doc.internal.pageSize.getWidth()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Visit Transcript', margin, y)
  y += 28

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Doctor: ${doctorName || 'Unknown'}`, margin, y)
  y += 16
  doc.text(`Date: ${visitDate}`, margin, y)
  y += 24

  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

  doc.setFontSize(11)
  const lines = doc.splitTextToSize(transcript, maxWidth)
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
    doc.text(line, margin, y)
    y += 16
  }

  doc.save(`visit-transcript-${visitDate}.pdf`)
}
