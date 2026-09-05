import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { KJUR } from 'https://esm.sh/jsrsasign@11.1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushRequest {
  targetStaffId?: string // if sending to specific staff
  targetRole?: 'admin' | 'staff' | 'all' // if broadcasting to admin or all staff
  title: string
  body: string
  data?: Record<string, string>
}

// Cached Google OAuth access token
let cachedToken: string | null = null
let tokenExpiry = 0

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken
  }

  const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  const claimSet = JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })

  const jwt = KJUR.jws.JWS.sign(null, header, claimSet, privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Google Auth error: ${JSON.stringify(data)}`)

  cachedToken = data.access_token
  tokenExpiry = now + (data.expires_in || 3600)
  return cachedToken as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const payload: PushRequest = await req.json()
    const { targetStaffId, targetRole, title, body, data = {} } = payload

    // 1. Fetch recipient FCM tokens
    let query = supabaseAdmin.from('staff_fcm_tokens').select('token, staff_id, staff:staff_id(role)')
    
    if (targetStaffId) {
      query = query.eq('staff_id', targetStaffId)
    }

    const { data: tokenRecords, error: tokenError } = await query
    if (tokenError) throw tokenError
    if (!tokenRecords || tokenRecords.length === 0) {
      return new Response(JSON.stringify({ success: true, delivered: 0, message: 'No registered tokens found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter by role if targetRole was specified
    let targetTokens = tokenRecords
    if (targetRole && targetRole !== 'all') {
      targetTokens = tokenRecords.filter((r: any) => r.staff?.role === targetRole)
    }

    const tokens = targetTokens.map((r: any) => r.token).filter(Boolean)
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, delivered: 0, message: 'No matching tokens for role' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Service account credentials
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'mystudio-88473'
    const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
    const privateKeyRaw = Deno.env.get('FIREBASE_PRIVATE_KEY')

    if (!clientEmail || !privateKeyRaw) {
      throw new Error('Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY in environment')
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n')
    const accessToken = await getGoogleAccessToken(clientEmail, privateKey)

    // 3. Dispatch to each FCM token
    const results = await Promise.allSettled(
      tokens.map(async (fcmToken: string) => {
        const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: fcmToken,
              notification: {
                title,
                body,
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'nailuxe_alerts',
                  sound: 'default',
                  priority: 'high',
                  default_sound: true,
                  default_vibrate_timings: true,
                },
              },
              data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
              },
            },
          }),
        })
        return fcmRes.json()
      })
    )

    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
