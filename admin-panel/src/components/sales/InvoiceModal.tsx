import React, { useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Printer, Download, CheckCircle2, MessageSquare, Phone, User, Calendar, Scissors, Copy, Camera, MoreVertical, Share2 } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { formatCurrency, formatDate } from '../../lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import toast from 'react-hot-toast'

export interface InvoiceItem {
  name: string
  price: number
}

export interface SaleInvoiceData {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  customerPhone: string
  staffName: string
  services: InvoiceItem[]
  grossAmount: number
  discountAmount: number
  totalAmount: number
  paymentMethod: string
  paymentStatus?: string
  notes?: string
  // Every underlying database row this invoice represents — a single
  // invoice can be built from more than one work_records row (e.g. a
  // visit split across two stylists) and/or its originating booking.
  // Deleting an invoice must delete every one of these, not just the
  // first row that happened to seed the display object.
  sourceIds?: { table: 'work_records' | 'bookings'; id: string }[]
}

interface InvoiceModalProps {
  open: boolean
  onClose: () => void
  sale: SaleInvoiceData | null
}

export function InvoiceModal({ open, onClose, sale }: InvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [copyingImage, setCopyingImage] = useState(false)

  if (!sale) return null

  // Build clean, professional WhatsApp message
  const getWhatsAppMessage = () => {
    const servicesList = sale.services
      .map(s => `  * ${s.name}: ${formatCurrency(s.price)}`)
      .join('\n')

    return `*NAILUXE STUDIO — INVOICE*
----------------------------------------
*Invoice #:* ${sale.invoiceNumber}
*Date:* ${formatDate(sale.date)}
*Customer:* ${sale.customerName}
*Staff / Stylist:* ${sale.staffName}

*Services Provided:*
${servicesList}${sale.discountAmount > 0 ? `\n*Discount:* -${formatCurrency(sale.discountAmount)}` : ''}
----------------------------------------
*Total Amount:* *${formatCurrency(sale.totalAmount)}*
*Payment Mode:* ${sale.paymentMethod?.toUpperCase() || 'PAID'}
----------------------------------------
Thank you for choosing Nailuxe Studio!
Panampilly Nagar, Kochi | +91 98407 00734`
  }

  // Helper to render visual invoice element as high-res PNG Blob using native SVG/browser rendering (supports oklch colors)
  const captureInvoiceBlob = async (): Promise<Blob | null> => {
    if (!printRef.current) return null
    const { toBlob } = await import('html-to-image')
    return await toBlob(printRef.current, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    })
  }

  // Copy invoice image to clipboard
  const handleCopyInvoiceImage = async () => {
    if (!printRef.current) return
    setCopyingImage(true)
    const toastId = toast.loading('Capturing invoice image...')
    try {
      const blob = await captureInvoiceBlob()
      if (!blob) {
        toast.error('Could not generate invoice image', { id: toastId })
        setCopyingImage(false)
        return
      }

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        toast.success('🎉 Invoice Image Copied! Press Ctrl + V in WhatsApp to paste.', {
          id: toastId,
          duration: 5000,
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Invoice-${sale.invoiceNumber}.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Invoice image downloaded! Attach it in WhatsApp.', { id: toastId })
      }
    } catch (err: unknown) {
      toast.error(`Capture failed: ${(err as Error).message}`, { id: toastId })
    } finally {
      setCopyingImage(false)
    }
  }

  const handleSendWhatsApp = async () => {
    let cleanPhone = (sale.customerPhone || '').replace(/[^0-9]/g, '')
    const isPlaceholder = !cleanPhone || cleanPhone.length < 10 || /^0+$/.test(cleanPhone)

    if (isPlaceholder) {
      const inputPhone = window.prompt(
        `Customer ${sale.customerName} currently has no valid phone number on file (${sale.customerPhone || 'blank'}).\n\nEnter 10-digit WhatsApp number to send invoice:`,
        ''
      )
      if (!inputPhone) return
      cleanPhone = inputPhone.replace(/[^0-9]/g, '')
    }

    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone
    }

    // Automatically copy the invoice picture to clipboard right as WhatsApp opens!
    try {
      const blob = await captureInvoiceBlob()
      if (blob && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        toast.success('📸 Invoice image copied! Just press Ctrl + V in WhatsApp to paste.', { duration: 6000 })
      }
    } catch {
      // Proceed even if clipboard write had browser permissions delay
    }

    const message = getWhatsAppMessage()
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(getWhatsAppMessage())
      toast.success('Invoice text copied to clipboard!')
    } catch {
      toast.error('Could not copy text to clipboard')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const loadImage = (url: string): Promise<string> => {
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

  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const formatPdfAmt = (amt: number) => 'Rs. ' + Math.round(amt).toLocaleString('en-IN')

      // Top Luxury Purple Header Banner
      doc.setFillColor(33, 0, 93) // #21005D
      doc.rect(0, 0, 210, 42, 'F')

      // Gold Accent Divider Line below banner
      doc.setFillColor(212, 175, 55) // #D4AF37 Gold
      doc.rect(0, 42, 210, 2, 'F')

      // Embed Studio Logo
      try {
        const logoBase64 = await loadImage('/logo.png')
        if (logoBase64) {
          // Rounded background container for logo
          doc.setFillColor(255, 255, 255)
          doc.roundedRect(16, 7, 26, 26, 4, 4, 'F')
          doc.addImage(logoBase64, 'PNG', 18, 9, 22, 22)
        }
      } catch (err) {
        console.warn('Could not embed logo image', err)
      }

      // Header Brand Name (positioned to the right of logo)
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text('NAILUXE STUDIO', 48, 19)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(234, 221, 255)
      doc.text('LUXURY NAIL CARE & BEAUTY EXPERIENCE', 48, 27)
      doc.text('Phone: +91 98407 00734 | Instagram: @nailuxestudio', 48, 33)

      // Invoice Details in Header (Right Side)
      doc.setTextColor(212, 175, 55) // Gold
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('TAX INVOICE', 194, 18, { align: 'right' })

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(sale.invoiceNumber, 194, 26, { align: 'right' })

      doc.setTextColor(234, 221, 255)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${formatDate(sale.date)}`, 194, 33, { align: 'right' })

      // Client & Attendant Information Cards
      const boxY = 52
      const boxHeight = 26

      // Box 1: Billed To
      doc.setFillColor(248, 246, 251)
      doc.setDrawColor(232, 222, 248)
      doc.roundedRect(16, boxY, 86, boxHeight, 3, 3, 'FD')

      doc.setTextColor(121, 116, 126)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('BILLED TO (CLIENT)', 22, boxY + 7)

      doc.setTextColor(29, 26, 34)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(sale.customerName, 22, boxY + 15)

      doc.setTextColor(73, 69, 79)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Phone: ${sale.customerPhone || 'Not provided'}`, 22, boxY + 21)

      // Box 2: Service Details
      doc.setFillColor(248, 246, 251)
      doc.setDrawColor(232, 222, 248)
      doc.roundedRect(108, boxY, 86, boxHeight, 3, 3, 'FD')

      doc.setTextColor(121, 116, 126)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('APPOINTMENT DETAILS', 114, boxY + 7)

      doc.setTextColor(29, 26, 34)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`Stylist: ${sale.staffName}`, 114, boxY + 15)

      doc.setTextColor(73, 69, 79)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Payment Mode: ${sale.paymentMethod?.toUpperCase() || 'PAID'}`, 114, boxY + 21)

      // Services Table
      const tableRows = sale.services.map((svc, i) => [
        String(i + 1),
        svc.name,
        formatPdfAmt(svc.price),
      ])

      autoTable(doc, {
        startY: 82,
        head: [['#', 'Description of Services', 'Price']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [103, 80, 164], // #6750A4
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          cellPadding: 4,
        },
        styles: {
          font: 'helvetica',
          fontSize: 9,
          textColor: [29, 26, 34],
          cellPadding: 4,
        },
        alternateRowStyles: {
          fillColor: [248, 245, 250],
        },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center' },
          1: { cellWidth: 136 },
          2: { cellWidth: 30, halign: 'right' },
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const endTableY = (doc as any).lastAutoTable.finalY + 10

      // Calculation Box (Right Aligned)
      const calcX = 130
      const calcWidth = 64
      doc.setFillColor(248, 246, 251)
      doc.setDrawColor(232, 222, 248)
      doc.roundedRect(calcX, endTableY, calcWidth, sale.discountAmount > 0 ? 30 : 22, 3, 3, 'FD')

      let currentY = endTableY + 7
      if (sale.discountAmount > 0) {
        doc.setFontSize(9)
        doc.setTextColor(121, 116, 126)
        doc.text('Subtotal:', calcX + 5, currentY)
        doc.setTextColor(29, 26, 34)
        doc.text(formatPdfAmt(sale.grossAmount), calcX + calcWidth - 5, currentY, { align: 'right' })

        currentY += 6
        doc.setTextColor(186, 26, 26)
        doc.text('Discount:', calcX + 5, currentY)
        doc.text(`-${formatPdfAmt(sale.discountAmount)}`, calcX + calcWidth - 5, currentY, { align: 'right' })
        currentY += 8
      } else {
        currentY += 3
      }

      // Total Line
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(33, 0, 93)
      doc.text('TOTAL PAID:', calcX + 5, currentY)
      doc.text(formatPdfAmt(sale.totalAmount), calcX + calcWidth - 5, currentY, { align: 'right' })

      // Paid Stamp Badge (Left Side)
      doc.setDrawColor(22, 163, 74)
      doc.setFillColor(240, 253, 244)
      doc.roundedRect(16, endTableY, 52, 22, 3, 3, 'FD')

      doc.setTextColor(22, 163, 74)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('PAID IN FULL', 24, endTableY + 9)

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`via ${sale.paymentMethod?.toUpperCase() || 'VERIFIED'}`, 24, endTableY + 16)

      // Signature & Policy Note
      const footerY = 255
      doc.setDrawColor(232, 222, 248)
      doc.line(16, footerY, 194, footerY)

      doc.setFontSize(8)
      doc.setTextColor(121, 116, 126)
      doc.setFont('helvetica', 'italic')
      doc.text('Terms: All services rendered are guaranteed. For appointments or inquiries, contact Nailuxe Studio.', 105, footerY + 6, { align: 'center' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(103, 80, 164)
      doc.text('Thank you for choosing Nailuxe Studio! We look forward to pampering you again.', 105, footerY + 12, { align: 'center' })

      doc.save(`Nailuxe_Invoice_${sale.invoiceNumber}.pdf`)
      toast.success('Invoice PDF downloaded! 📄')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Invoice #${sale.invoiceNumber}`} size="lg">
      <div className="space-y-6">
        {/* Luxury Clean Action Toolbar */}
        <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 bg-white dark:bg-[#1E1B2E] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] shadow-xs">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
              <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>PAID</span>
              <span className="text-[10px] font-bold opacity-75 uppercase tracking-wider">• {sale.paymentMethod?.toUpperCase() || 'CASH'}</span>
            </span>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Primary WhatsApp Button */}
            <button
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black bg-[#25D366] hover:bg-[#1ebd5a] text-white shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer"
              title="Send invoice via WhatsApp"
            >
              <MessageSquare size={15} className="fill-white/20 shrink-0" />
              <span>Send WhatsApp</span>
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold bg-[#6750A4] hover:bg-[#584291] text-white shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer"
              title="Download PDF Invoice"
            >
              <Download size={14} className="shrink-0" />
              <span>PDF</span>
            </button>

            {/* More Options Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="p-2 rounded-xl text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] transition active:scale-95 cursor-pointer"
                  title="More actions"
                >
                  <MoreVertical size={16} />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[210px] bg-white dark:bg-[#1E1B2E] p-1.5 rounded-2xl shadow-xl border border-[#E8DEF8] dark:border-[#382E48] text-xs animate-in fade-in-50 zoom-in-95"
                >
                  <DropdownMenu.Item
                    onClick={handleCopyInvoiceImage}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] cursor-pointer outline-none text-[#1D1A22] dark:text-[#E6E0E9] font-medium transition-colors"
                  >
                    <Camera size={15} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                    <span>{copyingImage ? 'Capturing Image...' : 'Copy Invoice Image'}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onClick={handleCopyMessage}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] cursor-pointer outline-none text-[#1D1A22] dark:text-[#E6E0E9] font-medium transition-colors"
                  >
                    <Copy size={15} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                    <span>Copy Text Summary</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="h-px bg-[#E8DEF8] dark:bg-[#382E48] my-1" />

                  <DropdownMenu.Item
                    onClick={handlePrint}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] cursor-pointer outline-none text-[#1D1A22] dark:text-[#E6E0E9] font-medium transition-colors"
                  >
                    <Printer size={15} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                    <span>Print Invoice</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div
          ref={printRef}
          className="p-6 bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] rounded-2xl shadow-xs space-y-6 font-sans">
          
          {/* Header */}
          <div className="flex justify-between items-start border-b border-[#E8DEF8] dark:border-[#382E48] pb-5">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Nailuxe Studio" className="w-12 h-12 object-contain rounded-xl" />
              <div>
                <h2 className="text-xl font-black tracking-tight text-[#1D1A22] dark:text-[#E6E0E9]">
                  NAILUXE STUDIO
                </h2>
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">Luxury Nails & Beauty Experience</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-[#6750A4] dark:text-[#D0BCFF]">INVOICE</div>
              <div className="text-base font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">
                {sale.invoiceNumber}
              </div>
              <div className="text-xs text-[#79747E] dark:text-[#938F99] mt-1">
                Date: {formatDate(sale.date)}
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 p-3.5 bg-[#F9F7FA] dark:bg-[#25222E] rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
              <span className="font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider block mb-1">
                Customer Details
              </span>
              <div className="font-extrabold text-sm text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1.5">
                <User size={13} className="text-[#6750A4]" /> {sale.customerName}
              </div>
              <div className="text-[#49454F] dark:text-[#CAC4D0] flex items-center gap-1.5">
                <Phone size={13} /> {sale.customerPhone || 'Not provided'}
              </div>
            </div>

            <div className="space-y-1 p-3.5 bg-[#F9F7FA] dark:bg-[#25222E] rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
              <span className="font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider block mb-1">
                Service Provider
              </span>
              <div className="font-extrabold text-sm text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1.5">
                <Scissors size={13} className="text-[#6750A4]" /> {sale.staffName}
              </div>
              <div className="text-[#49454F] dark:text-[#CAC4D0] flex items-center gap-1.5">
                <Calendar size={13} /> Mode: {sale.paymentMethod?.toUpperCase() || 'CASH'}
              </div>
            </div>
          </div>

          {/* Service Items Table */}
          <div className="border border-[#E8DEF8] dark:border-[#382E48] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#ECE6F0] dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] font-bold border-b border-[#E8DEF8] dark:border-[#382E48]">
                <tr>
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Service Description</th>
                  <th className="py-2.5 px-4 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DEF8] dark:divide-[#382E48]">
                {sale.services.map((svc, idx) => (
                  <tr key={idx} className="hover:bg-[#FDFBFE] dark:hover:bg-[#25222E]">
                    <td className="py-2.5 px-4 text-[#79747E]">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">
                      {svc.name}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-[#1D1A22] dark:text-[#E6E0E9]">
                      {formatCurrency(svc.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculation Breakdown */}
          <div className="flex justify-between items-end pt-2">
            <div className="p-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/40 rounded-xl inline-flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
              <div>
                <div className="text-[11px] font-bold text-green-900 dark:text-green-200 uppercase tracking-wider">
                  Payment Status: Fully Paid
                </div>
                <div className="text-[11px] text-green-700 dark:text-green-300">
                  Received via {sale.paymentMethod?.toUpperCase() || 'CASH'}
                </div>
              </div>
            </div>

            <div className="w-64 space-y-1.5 text-right text-xs">
              {sale.discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-[#79747E] dark:text-[#938F99]">
                    <span>Subtotal:</span>
                    <span className="font-semibold">{formatCurrency(sale.grossAmount)}</span>
                  </div>
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Discount:</span>
                    <span className="font-semibold">-{formatCurrency(sale.discountAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-[#E8DEF8] dark:border-[#382E48] text-sm">
                <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Total Amount:</span>
                <span className="font-black text-lg text-[#6750A4] dark:text-[#D0BCFF]">
                  {formatCurrency(sale.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center pt-4 border-t border-[#E8DEF8] dark:border-[#382E48] text-[11px] text-[#79747E] dark:text-[#938F99]">
            Thank you for choosing Nailuxe Studio! Please retain this invoice for your records.
          </div>
        </div>
      </div>
    </Modal>
  )
}
