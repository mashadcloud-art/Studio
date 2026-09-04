import type { QueryClient } from '@tanstack/react-query'

// Every screen anywhere in the app that reads booking/work-record/payment
// data and turns it into money — revenue, cash collected, P&L, payroll,
// dashboards, a staff member's own performance page. Deleting or changing a
// booking, work record, or sale must clear all of these together, in one
// place, instead of each screen's delete button hand-picking a handful of
// query keys and inevitably missing one (that's exactly how "delete a
// booking and the cash total is still there" bugs happen — a screen you
// weren't even looking at was reading a query nobody told to refresh).
const FINANCIAL_QUERY_KEYS = [
  'work_records',
  'dashboard_stats',
  'dashboard_today_bookings',
  'bookings',
  'bookings_month_indicators',
  'sales_work_records',
  'sales_bookings',
  'today_work_records',
  'revenue',
  'monthly_report',
  'staff_monthly_report',
  'payment_pending',
  'payment_collected_today',
  'sidebar_pending_payments',
  'sidebar_pending_bookings',
  'my_assigned_bookings',
  'my_bookings',
  'unassigned_bookings',
  'staff_upcoming_bookings_count',
  'my_overtime',
] as const

/**
 * Call this from the onSuccess of ANY mutation that deletes or changes a
 * booking, work record, sale/invoice, or collected payment. It clears every
 * screen in the app that summarizes money or bookings, so nothing is left
 * showing a customer, a cash amount, or a session that was just removed.
 */
export function invalidateFinancialQueries(qc: QueryClient) {
  FINANCIAL_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
}
