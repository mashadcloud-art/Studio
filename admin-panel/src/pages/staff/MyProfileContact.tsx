import { Phone, MapPin, Calendar, DollarSign } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatCurrency } from '../../lib/utils'
import { ProfileSectionHeader } from '../../components/staff/ProfileSectionHeader'

export function MyProfileContact() {
  const { staff } = useAuth()
  if (!staff) return null

  const items = [
    { icon: <Phone size={16} />, label: 'Phone', value: staff.phone },
    ...(staff.address ? [{ icon: <MapPin size={16} />, label: 'Address', value: staff.address }] : []),
    { icon: <Calendar size={16} />, label: 'Joined', value: formatDate(staff.joining_date) },
    { icon: <DollarSign size={16} />, label: 'Salary', value: `${formatCurrency(staff.salary)} / month` },
  ]

  return (
    <div className="space-y-2">
      <ProfileSectionHeader title="Contact Details" subtitle="Your account information" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 720 }}>
        {items.map(item => (
          <div
            key={item.label}
            className="rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48]"
            style={{ padding: '18px' }}
          >
            <div
              className="rounded-[10px] bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] text-[#6750A4] dark:text-[#D0BCFF]"
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
            >
              {item.icon}
            </div>
            <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
            <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
