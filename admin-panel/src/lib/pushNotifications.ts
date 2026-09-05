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

    // 2. Remove any previous listeners to prevent duplicates
    await PushNotifications.removeAllListeners()

    // 3. Register with Google FCM
    await PushNotifications.register()

    // 4. On successful registration, save FCM token to Supabase
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('FCM Registration Success! Token:', token.value)
      try {
        await db.from('staff_fcm_tokens').upsert({
          staff_id: userId,
          token: token.value,
          device_info: `${Capacitor.getPlatform()} - ${navigator.userAgent.slice(0, 80)}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'staff_id' })
        console.log('FCM Token successfully synced to Supabase!')
      } catch (err) {
        console.warn('Error saving FCM token to Supabase:', err)
      }
    })

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
 * Send a WhatsApp-style push notification via the send-push Supabase Edge Function
 */
export async function dispatchPushNotification(params: {
  targetStaffId?: string
  targetRole?: 'admin' | 'staff' | 'all'
  title: string
  body: string
  data?: Record<string, string>
}) {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: params,
    })
    if (error) {
      console.warn('Push dispatch warning:', error)
    }
    return data
  } catch (e) {
    console.warn('Push dispatch failed:', e)
    return null
  }
}
