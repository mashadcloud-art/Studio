import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, staff, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f4f4f5', flexDirection: 'column', gap: 16
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: '#18181b',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
        }}>💅</div>
        <div style={{
          width: 24, height: 24, border: '2px solid #e4e4e7', borderTopColor: '#18181b',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!staff) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', flexDirection: 'column', gap: 14
      }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#3f3f46' }}>Staff profile not found for this account.</p>
        <button
          onClick={() => signOut()}
          style={{
            padding: '8px 18px', background: '#18181b', color: 'white', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
          Sign Out & Return to Login
        </button>
      </div>
    )
  }

  if (adminOnly && staff.role !== 'admin') {
    // Receptionist can access bookings
    if (location.pathname === '/bookings' && staff.role === 'receptionist') {
      return <Outlet />
    }
    // Staff go to profile
    if (staff.role === 'staff' || staff.role === 'receptionist') {
      return <Navigate to="/my-profile" replace />
    }
    return <Navigate to="/my-profile" replace />
  }

  return <Outlet />
}
