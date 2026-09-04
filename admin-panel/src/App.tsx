import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Layout } from './components/layout/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/admin/Dashboard'
import { StaffPage } from './pages/admin/Staff'
import { StaffDetailPage } from './pages/admin/StaffDetail'
import { StaffChatPage } from './pages/admin/StaffChat'
import { StaffWorkPage } from './pages/admin/StaffWork'
import { CustomersPage } from './pages/admin/Customers'
import { ServicesPage } from './pages/admin/Services'
import { BookingsPage } from './pages/admin/Bookings'
import { WorkRecordsPage } from './pages/admin/WorkRecords'
import { SalesPage } from './pages/admin/Sales'
import { ReportsPage } from './pages/admin/Reports'
import { SalesDetailPage } from './pages/admin/SalesDetail'
import { DailyRevenueDetailPage } from './pages/admin/DailyRevenueDetail'
import { ServicesDetailPage } from './pages/admin/ServicesDetail'
import { OvertimePage } from './pages/admin/Overtime'
import { ExpensesPage } from './pages/admin/Expenses'
import { FinancePage } from './pages/admin/Finance'
import { AttendancePage } from './pages/admin/Attendance'
import { PayrollPage } from './pages/admin/Payroll'
import { SettingsPage } from './pages/admin/Settings'
import { MyProfile } from './pages/staff/MyProfile'
import { MyProfileBookings } from './pages/staff/MyProfileBookings'
import { MyProfileContact } from './pages/staff/MyProfileContact'
import { MyProfilePerformance } from './pages/staff/MyProfilePerformance'
import { MyProfileNotes } from './pages/staff/MyProfileNotes'
import { AddWork } from './pages/staff/AddWork'
import { MyWork } from './pages/staff/MyWork'
import { Gallery } from './pages/staff/Gallery'
import { PaymentCollection } from './pages/receptionist/PaymentCollection'
import { CheckIn } from './pages/staff/CheckIn'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60, retry: 1 } },
})

export default function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>

                {/* Admin-only */}
                <Route element={<ProtectedRoute adminOnly />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/staff" element={<StaffPage />} />
                  <Route path="/staff/:id" element={<StaffDetailPage />} />
                  <Route path="/staff/:id/chat" element={<StaffChatPage />} />
                  <Route path="/staff/:id/work" element={<StaffWorkPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/services" element={<ServicesPage />} />
                  <Route path="/work-records" element={<WorkRecordsPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/sales" element={<SalesDetailPage />} />
                  <Route path="/reports/daily" element={<DailyRevenueDetailPage />} />
                  <Route path="/reports/services" element={<ServicesDetailPage />} />
                  <Route path="/overtime" element={<OvertimePage />} />
                  <Route path="/expenses" element={<ExpensesPage />} />
                  <Route path="/finance" element={<FinancePage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/payroll" element={<PayrollPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                {/* Admin + Receptionist: Bookings & Sales */}
                <Route path="/bookings" element={<BookingsPage />} />
                <Route path="/sales" element={<SalesPage />} />

                {/* Staff + Receptionist */}
                <Route path="/my-profile" element={<MyProfile />} />
                <Route path="/my-profile/bookings" element={<MyProfileBookings />} />
                <Route path="/my-profile/contact" element={<MyProfileContact />} />
                <Route path="/my-profile/performance" element={<MyProfilePerformance />} />
                <Route path="/my-profile/notes" element={<MyProfileNotes />} />
                <Route path="/checkin" element={<CheckIn />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/add-work" element={<AddWork />} />
                <Route path="/my-work" element={<MyWork />} />
                <Route path="/payments" element={<PaymentCollection />} />

              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
