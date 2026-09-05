import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

/**
 * Initialize native device notifications permissions on Android/iOS
 */
export async function initNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return false

  try {
    const status = await LocalNotifications.checkPermissions()
    if (status.display !== 'granted') {
      const request = await LocalNotifications.requestPermissions()
      return request.display === 'granted'
    }
    return true
  } catch (err) {
    console.warn('Failed to initialize native notifications:', err)
    return false
  }
}

/**
 * Send an authentic native Android push notification banner (with sound & vibration)
 */
export async function triggerNativeNotification(title: string, body: string, id?: number) {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback if browser Notification API exists
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/logo.png' })
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
          largeIcon: 'ic_launcher',
          smallIcon: 'ic_launcher_foreground',
          sound: undefined,
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    })
  } catch (err) {
    console.warn('Could not schedule native notification:', err)
  }
}
