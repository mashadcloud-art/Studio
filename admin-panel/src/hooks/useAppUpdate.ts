import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENT_APP_VERSION } from '../config/appVersion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface AppUpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  apkUrl: string
  releaseNotes: string
  isForceUpdate: boolean
}

/**
 * Compare two semver strings: '1.0.5' vs '1.0.4'
 * Returns true if remote is strictly newer than current
 */
export function isNewerVersion(remote: string, current: string): boolean {
  if (!remote) return false
  const cleanRemote = remote.trim().replace(/^v/, '')
  const cleanCurrent = current.trim().replace(/^v/, '')

  const rParts = cleanRemote.split('.').map(Number)
  const cParts = cleanCurrent.split('.').map(Number)

  for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
    const r = rParts[i] || 0
    const c = cParts[i] || 0
    if (r > c) return true
    if (r < c) return false
  }
  return false
}

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo>({
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION,
    apkUrl: '',
    releaseNotes: '',
    isForceUpdate: false,
  })
  const [checking, setChecking] = useState(false)

  const checkUpdates = useCallback(async (): Promise<AppUpdateInfo> => {
    setChecking(true)
    try {
      const { data, error } = await db
        .from('settings')
        .select('key, value')
        .in('key', ['app_latest_version', 'app_apk_url', 'app_release_notes', 'app_force_update'])

      if (error || !data) {
        setChecking(false)
        return updateInfo
      }

      const map: Record<string, string> = {}
      data.forEach((row: { key: string; value: string }) => {
        map[row.key] = row.value
      })

      const latestVer = map['app_latest_version'] || CURRENT_APP_VERSION
      const apkUrl = map['app_apk_url'] || 'https://github.com/mashadcloud-art/Studio/releases/download/v1.0.6/Nailuxe-Studio.apk'
      const releaseNotes = map['app_release_notes'] || 'WhatsApp-style chat bar, staff notifications, and 1-tap permissions.'
      const isForce = map['app_force_update'] === 'true'

      const hasUpdate = isNewerVersion(latestVer, CURRENT_APP_VERSION)

      const result: AppUpdateInfo = {
        hasUpdate,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: latestVer,
        apkUrl,
        releaseNotes,
        isForceUpdate: isForce,
      }

      setUpdateInfo(result)
      setChecking(false)
      return result
    } catch {
      setChecking(false)
      return updateInfo
    }
  }, [updateInfo])

  useEffect(() => {
    checkUpdates()
  }, [])

  const downloadAndInstall = (customUrl?: string) => {
    const url = customUrl || updateInfo.apkUrl
    if (!url) return
    window.open(url, '_system')
  }

  return {
    ...updateInfo,
    checking,
    checkUpdates,
    downloadAndInstall,
  }
}
