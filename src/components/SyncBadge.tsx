import { useSyncState, runSync } from '../lib/autosync'

/** 頂欄同步狀態（點擊可立即同步或前往設定） */
export function SyncBadge() {
  const s = useSyncState()
  const time = s.lastSyncAt ? s.lastSyncAt.slice(11, 16) : ''
  const style = { background: 'rgba(255,255,255,.18)', color: '#fff', border: 0, borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 700 } as const
  if (s.status === 'unconfigured') return <a href="#/settings/sync" style={{ ...style, background: '#ffb300', color: '#222' }}>⚠ 未連雲端</a>
  if (s.status === 'syncing') return <span style={style}>⏳ 同步中</span>
  if (s.status === 'offline') return <span style={style}>📴 離線 · {s.pending} 筆待傳</span>
  if (s.status === 'error') return <button style={{ ...style, background: '#e53935' }} onClick={() => runSync()} title={s.message}>⚠ 同步失敗，重試</button>
  if (s.pending > 0) return <button style={style} onClick={() => runSync()}>☁ {s.pending} 筆待傳</button>
  return <button style={style} onClick={() => runSync()}>☁ 已同步 {time}</button>
}
