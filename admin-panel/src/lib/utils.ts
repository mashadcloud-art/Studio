import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, differenceInMinutes } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

// jsPDF's built-in fonts (Helvetica etc.) only support WinAnsi/Latin-1 —
// the ₹ glyph isn't in that set, and feeding it to doc.text()/autoTable
// doesn't just drop the character, it corrupts the whole string's spacing
// (stray superscript marks, letters spread apart, text running off the
// page edge). Use this instead of formatCurrency() anywhere text is drawn
// into a PDF; the on-screen UI and Excel exports are unaffected and should
// keep using formatCurrency() as normal.
export function formatCurrencyPDF(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-IN')}`
}

export function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    return format(parseISO(date), 'MMM dd, yyyy')
  }
  return format(date, 'MMM dd, yyyy')
}

export function formatDateTime(date: string | Date): string {
  if (typeof date === 'string') {
    return format(parseISO(date), 'MMM dd, yyyy HH:mm')
  }
  return format(date, 'MMM dd, yyyy HH:mm')
}

export function formatTime(date: string | Date): string {
  if (typeof date === 'string') {
    return format(parseISO(date), 'HH:mm')
  }
  return format(date, 'HH:mm')
}

export function calculateDuration(start: string, end: string | null): string {
  if (!end) return 'In progress'
  const mins = differenceInMinutes(parseISO(end), parseISO(start))
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function calculateOvertimeMinutes(
  start: string,
  end: string | null,
  standardHours: number
): number {
  if (!end) return 0
  const workedMins = differenceInMinutes(parseISO(end), parseISO(start))
  const standardMins = standardHours * 60
  return Math.max(0, workedMins - standardMins)
}

export function minutesToHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getMonthRange(year: number, month: number) {
  const start = format(new Date(year, month - 1, 1), 'yyyy-MM-dd')
  const end = format(new Date(year, month, 0), 'yyyy-MM-dd')
  return { start, end }
}

/**
 * Automatically capitalizes the first letter of each word (Title Case) for names and places.
 * e.g., "bijilala" -> "Bijilala", "nimisha nair" -> "Nimisha Nair"
 */
export function toTitleCase(str: string): string {
  if (!str) return ''
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
