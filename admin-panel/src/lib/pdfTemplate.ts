import jsPDF from 'jspdf'
import { format } from 'date-fns'

/**
 * Loads an image from public directory and returns base64 DataURL
 */
export function loadLogoBase64(url = '/logo.png'): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } else {
          resolve('')
        }
      } catch {
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = url
  })
}

interface DrawPdfHeaderOptions {
  doc: jsPDF
  reportTitle: string
  subtitle?: string
  staffName?: string
  logoBase64?: string
  periodLabel?: string
}

/**
 * Draws the signature Nailuxe luxury purple & gold header banner
 */
export function drawLuxuryPdfHeader({
  doc,
  reportTitle,
  subtitle = 'LUXURY NAIL CARE & BEAUTY EXPERIENCE',
  staffName,
  logoBase64,
  periodLabel,
}: DrawPdfHeaderOptions) {
  // 1. Deep Royal Purple Top Banner (#21005D)
  doc.setFillColor(33, 0, 93)
  doc.rect(0, 0, 210, 42, 'F')

  // 2. 2mm Gold Accent Divider Line (#D4AF37)
  doc.setFillColor(212, 175, 55)
  doc.rect(0, 42, 210, 2, 'F')

  // 3. Embed Logo if available
  if (logoBase64) {
    try {
      // White glossy rounded container for logo
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(14, 7, 26, 26, 4, 4, 'F')
      doc.addImage(logoBase64, 'PNG', 16, 9, 22, 22)
    } catch {
      // ignore logo draw errors
    }
  }

  // 4. Studio Name & Subtitles (Left side)
  const leftX = logoBase64 ? 46 : 14
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('NAILUXE STUDIO', leftX, 18)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(234, 221, 255) // Light lavender
  doc.text(subtitle.toUpperCase(), leftX, 25)
  doc.text('Panampilly Nagar, Kochi  |  +91 98407 00734  |  @nailuxestudio', leftX, 31)

  // 5. Report Title & Details (Right side)
  doc.setTextColor(212, 175, 55) // Gold accent
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(reportTitle.toUpperCase(), 196, 17, { align: 'right' })

  if (staffName) {
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(staffName.toUpperCase(), 196, 24, { align: 'right' })
  }

  if (periodLabel) {
    doc.setTextColor(234, 221, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(periodLabel, 196, 31, { align: 'right' })
  }

  // Reset text color for body
  doc.setTextColor(29, 26, 34)
}

interface MetricCard {
  label: string
  value: string
  sublabel?: string
  accentColor?: [number, number, number]
}

/**
 * Draws executive summary KPI cards across a 2-column or 4-column row
 */
export function drawSummaryCards(doc: jsPDF, startY: number, cards: MetricCard[]) {
  const count = cards.length
  const totalWidth = 182 // 14mm to 196mm
  const gap = 3
  const cardWidth = (totalWidth - (count - 1) * gap) / count
  const cardHeight = 22

  cards.forEach((card, index) => {
    const x = 14 + index * (cardWidth + gap)

    // Background tile
    doc.setFillColor(250, 248, 253) // soft lilac white
    doc.setDrawColor(232, 222, 248) // lavender border
    doc.setLineWidth(0.3)
    doc.roundedRect(x, startY, cardWidth, cardHeight, 3, 3, 'FD')

    // Top accent line if color provided
    if (card.accentColor) {
      doc.setFillColor(...card.accentColor)
      doc.roundedRect(x, startY, cardWidth, 1.2, 1, 1, 'F')
    }

    // Label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(121, 116, 126) // Muted purple gray
    doc.text(card.label.toUpperCase(), x + 4, startY + 6.5)

    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(33, 0, 93) // Royal Purple
    doc.text(card.value, x + 4, startY + 13.5)

    // Sublabel
    if (card.sublabel) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(103, 80, 164)
      doc.text(card.sublabel, x + 4, startY + 18.5)
    }
  })

  return startY + cardHeight + 6
}

/**
 * Draws a stylized section header with a luxury colored bar
 */
export function drawSectionHeader(doc: jsPDF, title: string, y: number, color: [number, number, number] = [103, 80, 164]) {
  // Left vertical accent bar
  doc.setFillColor(...color)
  doc.roundedRect(14, y - 4, 3, 6, 1, 1, 'F')

  // Section title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(33, 0, 93)
  doc.text(title, 20, y + 0.8)

  return y + 3
}

/**
 * Stamps page numbers and luxury studio footer on all pages
 */
export function stampLuxuryFooter(doc: jsPDF, confidentialNotice = 'CONFIDENTIAL SALON OPERATING RECORD') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages = (doc as any).internal.getNumberOfPages()
  const nowStr = format(new Date(), 'dd MMM yyyy, hh:mm a')

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Footer divider line
    doc.setDrawColor(232, 222, 248)
    doc.setLineWidth(0.3)
    doc.line(14, 284, 196, 284)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(121, 116, 126)

    // Left
    doc.text(`NAILUXE STUDIO  •  ${confidentialNotice}`, 14, 289)

    // Center
    doc.text(`Generated on ${nowStr}`, 105, 289, { align: 'center' })

    // Right
    doc.text(`Page ${i} of ${totalPages}`, 196, 289, { align: 'right' })
  }
}
