import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

export interface NotificationPayload {
  title: string
  body: string
  id?: number
  action?: 'chat' | 'overtime' | 'booking' | 'navigate'
  route?: string
}

let notificationNavigationHandler: ((payload: { action?: string; route?: string }) => void) | null = null

/**
 * Register callback to navigate when user taps a notification
 */
export function registerNotificationTapHandler(handler: (payload: { action?: string; route?: string }) => void) {
  notificationNavigationHandler = handler
}

/**
 * Initialize native device notifications permissions and high-priority Android channel
 */
export async function initNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return false

  try {
    // 1. Request permission on Android 13+
    const status = await LocalNotifications.checkPermissions()
    if (status.display !== 'granted') {
      await LocalNotifications.requestPermissions()
    }

    // 2. Create High-Priority Notification Channel on Android
    // importance: 5 ensures Heads-Up Banners appear over other apps even when minimized!
    await LocalNotifications.createChannel({
      id: 'nailuxe_alerts',
      name: 'Nailuxe Studio Alerts',
      description: 'Incoming customer bookings and staff team messages',
      importance: 5, // MAX importance for heads-up banner & vibration
      visibility: 1, // PUBLIC (shows on lock screen)
      vibration: true,
      lights: true,
      lightColor: '#6750A4',
    })

    // 3. Listen for when user taps on the notification
    await LocalNotifications.removeAllListeners()
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification.extra as { action?: string; route?: string } | undefined
      if (extra && notificationNavigationHandler) {
        notificationNavigationHandler(extra)
      }
    })

    return true
  } catch (err) {
    console.warn('Failed to initialize native notifications:', err)
    return false
  }
}

/**
 * Send an authentic native Android push notification banner (with sound & vibration)
 * Works when the app is active, minimized, or in background.
 */
export async function triggerNativeNotification({
  title,
  body,
  id,
  action,
  route,
}: NotificationPayload) {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback if browser Notification API exists
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, { body, icon: '/logo.png' })
        notif.onclick = () => {
          window.focus()
          if (notificationNavigationHandler) {
            notificationNavigationHandler({ action, route })
          }
        }
      } catch {
        // ignore
      }
    }
    return
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: id || Math.floor(Math.random() * 1000000),
          title,
          body,
          channelId: 'nailuxe_alerts',
          extra: { action, route },
          schedule: { at: new Date(Date.now() + 50) },
        },
      ],
    })
  } catch (err) {
    console.warn('Could not schedule native notification:', err)
  }
}
