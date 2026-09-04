import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function ProfileSectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button
        onClick={() => navigate('/my-profile')}
        aria-label="Back to profile"
        style={{
          width: 38, height: 38, borderRadius: '50%', border: '1px solid #e4e4e7', background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <ArrowLeft size={17} color="#09090b" />
      </button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#09090b', letterSpacing: '-0.4px' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>{subtitle}</p>}
      </div>
    </div>
  )
}
