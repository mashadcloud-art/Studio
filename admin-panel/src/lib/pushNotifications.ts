import { PushNotifications, type Token, type ActionPerformed } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

let tapHandler: ((data: Record<string, string>) => void) | null = null

export function registerPushTapHandler(handler: (data: Record<string, string>) => void) {
  tapHandler = handler
}

/**
 * Initialize Push Notifications on mobile device
 * Prompts user for permission, registers with Firebase Cloud Messaging,
 * and saves the FCM token to Supabase for the logged in staff member.
 */
export async function initPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications: not on native platform, skipping registration')
    return
  }

  try {
    // 1. Check & request push permissions
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions()
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied by user')
      return
    }

    // 2. Register native high-importance notification channel on Android
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'nailuxe_alerts',
          name: 'Nailuxe Alerts & Messages',
          description: 'Instant alerts for staff notes, messages, and studio updates',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        })
      } catch (channelErr) {
        console.warn('Channel creation error:', channelErr)
      }
    }

    // 3. Sync existing token if already stored on device
    const existingToken = localStorage.getItem('nailuxe_fcm_token')
    if (existingToken) {
      db.from('staff').update({ address: `[fcm]:${existingToken}` }).eq('id', userId).catch(() => {})
    }

    // 4. Remove any previous listeners to prevent duplicates
    await PushNotifications.removeAllListeners()

    // 5. Attach registration listener BEFORE triggering registration
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('FCM Registration Success! Token:', token.value)
      try {
        localStorage.setItem('nailuxe_fcm_token', token.value)
        localStorage.setItem('nailuxe_fcm_registered_at', new Date().toISOString())

        const { data: staffData } = await db.from('staff').select('role').eq('id', userId).maybeSingle()
        const isUserAdmin = staffData?.role === 'admin'

        // 1. Save directly into staff table under address (works reliably under staff RLS: auth.uid() = id)
        await db.from('staff').update({
          address: `[fcm]:${token.value}`
        }).eq('id', userId).catch((e: any) => console.warn('staff address fcm update error:', e))

        // 2. Save into staff_notes (works under staff RLS without needing admin permissions!)
        await db.from('staff_notes').insert({
          staff_id: userId,
          sender_id: userId,
          sender_role: isUserAdmin ? 'admin' : 'staff',
          message: `[fcm_token]:${token.value}`,
        }).catch((e: any) => console.warn('staff_notes token insert error:', e))

        // 3. Save to settings table (succeeds for admin)
        if (isUserAdmin) {
          await db.from('settings').upsert({
            key: `fcm_token_${userId}`,
            value: token.value,
          }, { onConflict: 'key' }).catch(() => {})
          await db.from('settings').upsert({
            key: `fcm_token_admin_${userId}`,
            value: token.value,
          }, { onConflict: 'key' }).catch(() => {})
          await db.from('settings').upsert({
            key: 'fcm_token_admin',
            value: token.value,
          }, { onConflict: 'key' }).catch(() => {})
        }

        console.log('FCM Token successfully synced to Supabase!')
      } catch (err) {
        console.warn('Error saving FCM token to Supabase:', err)
      }
    })

    // 6. Register with Google FCM
    await PushNotifications.register()

    // 5. On registration error
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('FCM Registration Error:', error)
    })

    // 6. On notification received while app is in foreground
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received in foreground:', notification)
    })

    // 7. On user tapping notification
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('Push notification tapped:', action)
      const data = action.notification.data as Record<string, string> | undefined
      if (data && tapHandler) {
        tapHandler(data)
      }
    })

  } catch (err) {
    console.warn('Failed to initialize push notifications:', err)
  }
}

/**
 * Send a WhatsApp-style push notification directly through Google FCM
 * Works when app is minimized, locked, or completely closed!
 */
export async function dispatchPushNotification(params: {
  targetStaffId?: string
  targetRole?: 'admin' | 'staff'
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const { sendFcmPushNotification } = await import('./fcmDispatcher')
    await sendFcmPushNotification(params)
    await supabase.functions.invoke('send-push', { body: params }).catch(() => {})
  } catch (e) {
    console.warn('Push dispatch failed:', e)
  }
}
