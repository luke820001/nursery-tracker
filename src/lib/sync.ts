/**
 * 雲端同步：
 *  A. Google Sheets（Apps Script Web App）— 完全免費、單向推送 + 拉回，適合 <10 人小團隊
 *  B. Supabase — 免費層、雙向同步、Last-Write-Wins（以 updatedAt 比較）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { db, getSettings, saveSettings } from './db'
import { nowIso } from './dates'
import type { Batch, BatchEvent, Crop, Customer, Location } from './types'

export type SyncResult = { ok: true; pushed: number; pulled: number } | { ok: false; error: string }

/** 同步格式版本。提高這個數字 → 每台裝置下次同步會做一次全量下載 */
export const SYNC_SCHEMA = 2

type TableName = 'batches' | 'events' | 'crops' | 'customers' | 'locations'
const TABLES: TableName[] = ['crops', 'customers', 'locations', 'batches', 'events']

async function collectQueue() {
  const ops = await db.syncQueue.toArray()
  // 同一列多次寫入只推最後狀態
  const latest = new Map<string, { table: TableName; rowId: string }>()
  for (const op of ops) latest.set(`${op.table}:${op.rowId}`, { table: op.table, rowId: op.rowId })
  const payload: Record<TableName, unknown[]> = { batches: [], events: [], crops: [], customers: [], locations: [] }
  for (const { table, rowId } of latest.values()) {
    const row = await (db[table] as any).get(rowId)
    if (row) payload[table].push(row)
  }
  return { ops, payload, count: latest.size }
}

async function applyPulled(rows: Partial<Record<TableName, any[]>>) {
  let n = 0
  await db.transaction('rw', [db.batches, db.events, db.crops, db.customers, db.locations], async () => {
    for (const t of TABLES) {
      for (const remote of rows[t] ?? []) {
        const local = await (db[t] as any).get(remote.id)
        const remoteAt = remote.updatedAt ?? ''
        if (!local || (local.updatedAt ?? '') < remoteAt) {
          await (db[t] as any).put(remote)
          n++
        }
      }
    }
  })
  return n
}

// ---------------- A. Google Sheets via Apps Script ----------------
export async function syncSheets(): Promise<SyncResult> {
  const s = await getSettings()
  if (!s.sheetsWebhookUrl) return { ok: false, error: '尚未設定 Google Apps Script 網址' }
  try {
    const { ops, payload, count } = await collectQueue()
    const full = (s.syncSchema ?? 0) < SYNC_SCHEMA
    const body = JSON.stringify({ token: s.sheetsToken ?? '', since: full ? '' : (s.lastSyncAt ?? ''), push: payload })
    // Apps Script 不支援自訂 CORS header；用 text/plain 可避免 preflight
    const res = await fetch(s.sheetsWebhookUrl, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = await res.json()
    if (json.error) return { ok: false, error: String(json.error) }
    const pulled = await applyPulled(json.pull ?? {})
    await db.syncQueue.bulkDelete(ops.map((o) => o.id!))
    // 以伺服器時間為基準（伺服器用「收到時間」判斷要拉哪些資料），避免時序漏掉別人的更新
    await saveSettings({ lastSyncAt: typeof json.serverTime === 'string' ? json.serverTime : nowIso(), syncSchema: SYNC_SCHEMA })
    return { ok: true, pushed: count, pulled }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------- B. Supabase ----------------
let sb: SupabaseClient | null = null
async function client(url: string, key: string) {
  if (!sb) {
    const { createClient } = await import('@supabase/supabase-js') // 動態載入，未使用 Supabase 時不佔體積
    sb = createClient(url, key, { auth: { persistSession: false } })
  }
  return sb
}

// 前端 camelCase ↔ DB snake_case 直接以 JSON 欄位存放，避免 schema 漂移；
// 每張表只有 id / updated_at / deleted / data(jsonb)
function wrap(row: any) {
  return { id: row.id, updated_at: row.updatedAt, deleted: row.deleted ? true : false, data: row }
}

export async function syncSupabase(): Promise<SyncResult> {
  const s = await getSettings()
  if (!s.supabaseUrl || !s.supabaseAnonKey) return { ok: false, error: '尚未設定 Supabase URL / anon key' }
  try {
    const c = await client(s.supabaseUrl, s.supabaseAnonKey)
    const { ops, payload, count } = await collectQueue()
    for (const t of TABLES) {
      if (!payload[t].length) continue
      const { error } = await c.from(t).upsert(payload[t].map(wrap), { onConflict: 'id' })
      if (error) return { ok: false, error: `${t}: ${error.message}` }
    }
    const pulledRows: Partial<Record<TableName, any[]>> = {}
    const fullSb = (s.syncSchema ?? 0) < SYNC_SCHEMA
    for (const t of TABLES) {
      let q = c.from(t).select('data')
      if (s.lastSyncAt && !fullSb) q = q.gt('updated_at', s.lastSyncAt)
      const { data, error } = await q
      if (error) return { ok: false, error: `${t}: ${error.message}` }
      pulledRows[t] = (data ?? []).map((r: any) => r.data as Batch | BatchEvent | Crop | Customer | Location)
    }
    const pulled = await applyPulled(pulledRows)
    await db.syncQueue.bulkDelete(ops.map((o) => o.id!))
    await saveSettings({ lastSyncAt: nowIso(), syncSchema: SYNC_SCHEMA })
    return { ok: true, pushed: count, pulled }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 依設定自動選擇同步管道（優先 Supabase，其次 Sheets） */
export async function syncAuto(): Promise<SyncResult> {
  const s = await getSettings()
  if (s.supabaseUrl && s.supabaseAnonKey) return syncSupabase()
  if (s.sheetsWebhookUrl) return syncSheets()
  return { ok: false, error: '尚未設定任何雲端同步' }
}

export async function pendingCount() {
  return db.syncQueue.count()
}
