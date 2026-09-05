import { supabase } from './supabase'
import serviceAccount from '../../../supabase/firebase-service-account.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

function base64Url(buffer: ArrayBuffer | string): string {
  let str: string
  if (typeof buffer === 'string') {
    str = btoa(unescape(encodeURIComponent(buffer)))
  } else {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    str = btoa(binary)
  }
  return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Generate Google OAuth2 access token for Firebase Cloud Messaging HTTP v1 API
 */
async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && now < tokenExpiresAt - 60) {
    return cachedAccessToken
  }

  const pem = serviceAccount.private_key
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = pem
    .substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter))
    .replace(/\s/g, '')

  const binaryString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    binaryDer[i] = binaryString.charCodeAt(i)
  }

  const cryptoKey = await window.crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`
  const encoder = new TextEncoder()
  const sigBuffer = await window.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedJwt)
  )
  const signature = base64Url(sigBuffer)
  const jwt = `${unsignedJwt}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const resData = await res.json()
  if (!res.ok || !resData.access_token) {
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(resData)}`)
  }

  cachedAccessToken = resData.access_token as string
  tokenExpiresAt = now + (resData.expires_in || 3600)
  return cachedAccessToken
}

function cleanNotificationBody(body: string): string {
  if (!body) return 'New notification'
  const trimmed = body.trim()
  if (trimmed.startsWith('[image]') || (trimmed.includes('cloudinary.com') && !trimmed.startsWith('[video]'))) {
    return '📷 Photo'
  }
  if (trimmed.startsWith('[video]') || trimmed.includes('/video/upload/')) {
    return '🎥 Video'
  }
  if (trimmed.startsWith('🎤') || trimmed.includes('/audio/upload/') || trimmed.endsWith('.mp3') || trimmed.endsWith('.webm') || trimmed.endsWith('.m4a')) {
    return '🎤 Voice note'
  }
  return trimmed
}

/**
 * Dispatch Firebase Cloud Messaging (FCM) v1 push notification
 * Delivers directly to Android Google Play Services even when app is closed or phone is locked!
 */
export async function sendFcmPushNotification(params: {
  targetStaffId?: string
  targetRole?: 'admin' | 'staff'
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const tokens: string[] = []

    // 1. Look up recipient's FCM token from Supabase
    if (params.targetStaffId) {
      // 1a. Check staff table address
      try {
        const { data: staffRow } = await db
          .from('staff')
          .select('address')
          .eq('id', params.targetStaffId)
          .maybeSingle()
        if (staffRow?.address && staffRow.address.includes('[fcm]:')) {
          const tok = staffRow.address.replace('[fcm]:', '').trim()
          if (tok && !tokens.includes(tok)) tokens.push(tok)
        }
      } catch {}

      // 1b. Check settings table
      const { data: settingRow } = await db
        .from('settings')
        .select('value')
        .eq('key', `fcm_token_${params.targetStaffId}`)
        .maybeSingle()
      if (settingRow?.value && !tokens.includes(settingRow.value)) tokens.push(settingRow.value)

      const { data: adminRow } = await db
        .from('settings')
        .select('value')
        .eq('key', `fcm_token_admin_${params.targetStaffId}`)
        .maybeSingle()
      if (adminRow?.value && !tokens.includes(adminRow.value)) tokens.push(adminRow.value)

      // 1c. Check staff_notes for staff token
      try {
        const { data: noteRow } = await db
          .from('staff_notes')
          .select('message')
          .eq('staff_id', params.targetStaffId)
          .like('message', '[fcm_token]:%')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (noteRow?.message) {
          const tok = noteRow.message.replace('[fcm_token]:', '').trim()
          if (tok && !tokens.includes(tok)) tokens.push(tok)
        }
      } catch {
        // ignore
      }
    }

    if (params.targetRole === 'admin') {
      // 1a. Directly check global key 'fcm_token_admin'
      const { data: globalAdmin } = await db
        .from('settings')
        .select('value')
        .eq('key', 'fcm_token_admin')
        .maybeSingle()
      if (globalAdmin?.value && !tokens.includes(globalAdmin.value)) tokens.push(globalAdmin.value)

      // 1b. Check all keys like 'fcm_token_admin%'
      const { data: adminRows } = await db
        .from('settings')
        .select('value')
        .like('key', 'fcm_token_admin%')
      if (adminRows) {
        adminRows.forEach((r: { value: string }) => {
          if (r.value && !tokens.includes(r.value)) tokens.push(r.value)
        })
      }

      // 1c. Find all admin staff members and check their fcm_token_${id} or address
      try {
        const { data: adminStaff } = await db.from('staff').select('id, address').eq('role', 'admin')
        if (adminStaff && adminStaff.length > 0) {
          adminStaff.forEach((s: { id: string; address?: string }) => {
            if (s.address && s.address.includes('[fcm]:')) {
              const tok = s.address.replace('[fcm]:', '').trim()
              if (tok && !tokens.includes(tok)) tokens.push(tok)
            }
          })
          const keys = adminStaff.map((s: { id: string }) => `fcm_token_${s.id}`)
          const { data: staffTokenRows } = await db.from('settings').select('value').in('key', keys)
          if (staffTokenRows) {
            staffTokenRows.forEach((r: { value: string }) => {
              if (r.value && !tokens.includes(r.value)) tokens.push(r.value)
            })
          }
        }
      } catch {
        // ignore
      }
    }

    // Also check staff_fcm_tokens table if it was created
    try {
      let q = db.from('staff_fcm_tokens').select('token')
      if (params.targetStaffId) q = q.eq('staff_id', params.targetStaffId)
      const { data: tokenRows } = await q
      if (tokenRows) {
        tokenRows.forEach((r: { token: string }) => {
          if (r.token && !tokens.includes(r.token)) tokens.push(r.token)
        })
      }
    } catch {
      // ignore
    }

    // If sender's own token is saved locally, handle test mode and fallback
    const myToken = typeof window !== 'undefined' ? localStorage.getItem('nailuxe_fcm_token') : null

    if (myToken && (params.data?.isTest || tokens.length === 0)) {
      if (!tokens.includes(myToken)) {
        tokens.push(myToken)
      }
    }

    const finalTokens = (!params.data?.isTest && myToken && tokens.length > 1)
      ? tokens.filter((t) => t !== myToken)
      : tokens

    if (finalTokens.length === 0) {
      console.log('No recipient FCM tokens available to dispatch to.')
      return { sent: 0 }
    }

    const accessToken = await getGoogleAccessToken()
    const projectId = serviceAccount.project_id

    const results = await Promise.allSettled(
      finalTokens.map(async (token) => {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title: params.title,
                  body: cleanNotificationBody(params.body),
                },
                android: {
                  priority: 'HIGH',
                  notification: {
                    channel_id: 'nailuxe_alerts',
                    sound: 'default',
                    default_sound: true,
                    default_vibrate_timings: true,
                    notification_priority: 'PRIORITY_MAX',
                    visibility: 'PUBLIC',
                  },
                },
                data: {
                  ...(params.data || {}),
                },
              },
            }),
          }
        )
        return response.json()
      })
    )

    console.log('FCM Push Notification Results:', results)
    return { sent: finalTokens.length, results }
  } catch (err) {
    console.warn('sendFcmPushNotification error:', err)
    return { sent: 0, error: err }
  }
}
