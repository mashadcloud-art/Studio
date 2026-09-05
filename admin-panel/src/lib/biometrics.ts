import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const BIOMETRIC_ENABLED_KEY = 'nailuxe_biometric_enabled'
const BIOMETRIC_CREDS_KEY = 'nailuxe_biometric_creds'

export async function isBiometricSupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await NativeBiometric.isAvailable()
    return result.isAvailable
  } catch {
    return false
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY })
    return value === 'true'
  } catch {
    return false
  }
}

export async function enableBiometricLogin(email: string, password: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    // Encrypt & store credentials in Preferences
    await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: 'true' })
    await Preferences.set({
      key: BIOMETRIC_CREDS_KEY,
      value: JSON.stringify({ email, password }),
    })
    return true
  } catch (err) {
    console.warn('Failed to enable biometric:', err)
    return false
  }
}

export async function disableBiometricLogin(): Promise<void> {
  try {
    await Preferences.remove({ key: BIOMETRIC_ENABLED_KEY })
    await Preferences.remove({ key: BIOMETRIC_CREDS_KEY })
  } catch {
    // ignore
  }
}

export async function authenticateWithBiometrics(): Promise<{ email: string; password: string } | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const available = await isBiometricSupported()
    if (!available) return null

    // Trigger native Android fingerprint / face scan modal
    await NativeBiometric.verifyIdentity({
      reason: 'Scan your fingerprint or face to sign into Nailuxe Studio',
      title: 'Nailuxe Studio Biometric Sign-in',
      subtitle: 'Instant secure login',
      description: 'Touch fingerprint sensor or face camera',
    })

    // If verification succeeded, load saved credentials
    const { value } = await Preferences.get({ key: BIOMETRIC_CREDS_KEY })
    if (!value) return null
    return JSON.parse(value)
  } catch (err) {
    console.warn('Biometric auth cancelled or failed:', err)
    return null
  }
}
