import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

/**
 * Storage adapter that persists Supabase auth session in Android native SharedPreferences
 * so users stay logged in permanently even after killing the app or rebooting.
 */
export const CapacitorStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { value } = await Preferences.get({ key })
        if (value) return value
      } catch (e) {
        console.warn('Error reading from Preferences:', e)
      }
    }
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Preferences.set({ key, value })
      } catch (e) {
        console.warn('Error saving to Preferences:', e)
      }
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // ignore
      }
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Preferences.remove({ key })
      } catch (e) {
        console.warn('Error removing from Preferences:', e)
      }
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    }
  },
}
