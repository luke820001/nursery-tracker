/**
 * 自動同步：資料一有變動就排程上傳；連線恢復、App 回到前景、定時也會同步。
 * 目的：手機只是暫存，雲端才是主要儲存位置。
 */
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db, getSettings } from './db'
import { syncAuto, type SyncResult } from './sync'

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'ok' | 'error'
export interface SyncState {
  status: SyncStatus
  pending: number
  lastSyncAt?: string
  message?: string
}

let state: SyncState = { status: 'idle', pending: 0 }
const listeners = new Set<() => void>()
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useSyncState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}

let timer: number | undefined
let running = false
let started = false

export function scheduleSync(delayMs = 2000) {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(runSync, delayMs)
}

export async function runSync(): Promise<SyncResult | null> {
  if (running) { scheduleSync(3000); return null }
  const s = await getSettings()
  const configured = !!(s.sheetsWebhookUrl || (s.supabaseUrl && s.supabaseAnonKey))
  if (!configured) { set({ status: 'unconfigured', lastSyncAt: s.lastSyncAt }); return null }
  if (!navigator.onLine) { set({ status: 'offline', lastSyncAt: s.lastSyncAt }); return null }
  running = true
  set({ status: 'syncing' })
  try {
    const r = await syncAuto()
    const after = await getSettings()
    if (r.ok) set({ status: 'ok', message: undefined, lastSyncAt: after.lastSyncAt })
    else set({ status: 'error', message: r.error, lastSyncAt: after.lastSyncAt })
    return r
  } finally {
    running = false
  }
}

export function startAutoSync() {
  if (started) return
  started = true
  // 佇列有東西 → 2 秒後上傳（合併連續操作）
  liveQuery(() => db.syncQueue.count()).subscribe({
    next: (n) => { set({ pending: n }); if (n > 0) scheduleSync(2000) },
  })
  window.addEventListener('online', () => scheduleSync(500))
  window.addEventListener('offline', () => set({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500) })
  window.setInterval(() => scheduleSync(0), 5 * 60 * 1000) // 每 5 分鐘拉一次其他人的更新
  scheduleSync(800) // 開啟 App 先拉一次
}

/**
 * 雲端設定來源（優先順序）：
 *  1. 團隊設定連結 ?sheet=<AppsScriptURL>&token=<密語>
 *  2. 建置時帶入的預設值（GitHub Secrets → VITE_SHEETS_URL / VITE_SHEETS_TOKEN）
 * 兩者都會在第一次開啟時寫入設定，之後自動同步、下載全部資料。
 */
export async function applySetupLink() {
  const { saveSettings } = await import('./db')
  const q = new URLSearchParams(window.location.search)
  const sheet = q.get('sheet')
  if (sheet) {
    await saveSettings({ sheetsWebhookUrl: sheet, sheetsToken: q.get('token') ?? '' })
    history.replaceState(null, '', window.location.pathname + window.location.hash)
    return true
  }
  const defUrl = import.meta.env.VITE_SHEETS_URL as string | undefined
  const defToken = (import.meta.env.VITE_SHEETS_TOKEN as string | undefined) ?? ''
  if (defUrl) {
    const s = await getSettings()
    if (!s.sheetsWebhookUrl && !s.supabaseUrl) {
      await saveSettings({ sheetsWebhookUrl: defUrl, sheetsToken: defToken })
      return true
    }
  }
  return false
}

export async function buildSetupLink() {
  const s = await getSettings()
  if (!s.sheetsWebhookUrl) return ''
  const u = new URL(window.location.origin + window.location.pathname)
  u.searchParams.set('sheet', s.sheetsWebhookUrl)
  if (s.sheetsToken) u.searchParams.set('token', s.sheetsToken)
  return u.toString()
}
