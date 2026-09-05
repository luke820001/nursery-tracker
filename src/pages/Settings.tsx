import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { byOrder, db, exportAll, getSettings, importAll, putMaster, saveSettings } from '../lib/db'
import { buildBatchCsv, buildEventCsv, buildOrderCsv, shareOrDownload } from '../lib/export'
import { buildSetupLink, runSync, useSyncState } from '../lib/autosync'
import { localDateTime, today } from '../lib/dates'
import { uid } from '../lib/id'
import type { AppSettings, Crop } from '../lib/types'
import { Field, Sheet, Stepper, TopBar, back, confirm, useToast } from '../components/ui'

export default function Settings({ sub }: { sub?: string }) {
  if (sub === 'crops') return <Crops />
  if (sub === 'locations') return <SimpleList table="locations" title="溫室 / 床位" />
  if (sub === 'sync') return <Sync />
  if (sub === 'backup') return <Backup />
  return <Home />
}

function Home() {
  const sync = useSyncState()
  const [s, setS] = useState<AppSettings | null>(null)
  useEffect(() => { getSettings().then(setS) }, [])
  const saveName = async (farmName: string) => { setS((c) => c && { ...c, farmName }); await saveSettings({ farmName }) }
  const link = (to: string, label: string, sub?: string) => (
    <a className="list-item" href={'#/settings/' + to}>
      <div className="grow"><div style={{ fontWeight: 700 }}>{label}</div>{sub && <div className="muted">{sub}</div>}</div>
      <span className="muted">›</span>
    </a>
  )
  return (
    <>
      <TopBar title="設定" sub={s?.farmName} />
      <main className="page">
        <div className="section-title">種苗場</div>
        <div className="card">
          <Field label="名稱"><input value={s?.farmName ?? ''} onChange={(e) => saveName(e.target.value)} /></Field>
        </div>
        <div className="section-title">主檔</div>
        <div className="card" style={{ padding: '2px 14px' }}>
          {link('crops', '產品（作物）與育苗天數', '苗期、浸種、健化、損耗率、常用品種')}
          {link('locations', '溫室 / 床位')}
        </div>
        <div className="section-title">資料</div>
        <div className="card" style={{ padding: '2px 14px' }}>
          {link('sync', '雲端同步 / 匯出', sync.status === 'unconfigured' ? '⚠ 尚未設定，資料只在本機' : sync.pending ? `${sync.pending} 筆待同步` : s?.lastSyncAt ? '上次 ' + localDateTime(s.lastSyncAt) : '')}
          {link('backup', '備份與還原', 'JSON 全量備份')}
        </div>
        <div className="muted" style={{ textAlign: 'center', marginTop: 24 }}>育苗排程 v0.1 · 離線可用，連線後自動同步雲端</div>
      </main>
    </>
  )
}

// ---------------- 作物主檔 ----------------
function Crops() {
  const crops = useLiveQuery(async () => (await db.crops.toArray()).sort(byOrder), []) ?? []
  const [edit, setEdit] = useState<Crop | null>(null)
  const toast = useToast()
  const blank = (): Crop => ({ id: uid(), name: '', seedlingDays: 28, soakDays: 0, hardenDays: 5, expectedLossRate: 0.05, defaultTrayCells: 128, varieties: [], sortOrder: crops.length + 1, active: true })
  const save = async () => {
    if (!edit?.name.trim()) return toast('請輸入作物名稱')
    await putMaster('crops', edit)
    setEdit(null)
  }
  return (
    <>
      <TopBar title="作物與育苗天數" onBack={back} right={<button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={() => setEdit(blank())}>＋</button>} />
      <main className="page">
        <div className="card" style={{ padding: '2px 14px' }}>
          {crops.map((c) => (
            <button key={c.id} className="list-item" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left' }} onClick={() => setEdit({ ...c })}>
              <div className="grow">
                <div style={{ fontWeight: 700, opacity: c.active ? 1 : .5 }}>{c.name}{!c.active && '（停用）'}</div>
                <div className="muted">苗期 {c.seedlingDays} 天 · 健化 {c.hardenDays} 天 · 損耗 {Math.round(c.expectedLossRate * 100)}% · {c.defaultTrayCells}穴</div>
              </div>
              <span className="muted">›</span>
            </button>
          ))}
        </div>
      </main>
      {edit && (
        <Sheet title={edit.name || '新增作物'} onClose={() => setEdit(null)}>
          <Field label="名稱"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="苗期天數"><Stepper value={edit.seedlingDays} onChange={(v) => setEdit({ ...edit, seedlingDays: v })} min={1} /></Field>
            <Field label="浸種/催芽天數"><Stepper value={edit.soakDays} onChange={(v) => setEdit({ ...edit, soakDays: v })} /></Field>
            <Field label="健化天數"><Stepper value={edit.hardenDays} onChange={(v) => setEdit({ ...edit, hardenDays: v })} /></Field>
            <Field label="預估損耗 %"><Stepper value={Math.round(edit.expectedLossRate * 100)} onChange={(v) => setEdit({ ...edit, expectedLossRate: v / 100 })} /></Field>
          </div>
          <Field label="預設穴盤規格"><Stepper value={edit.defaultTrayCells} onChange={(v) => setEdit({ ...edit, defaultTrayCells: v })} step={1} /></Field>
          <Field label="常用品種（逗號分隔）">
            <input value={edit.varieties.join(',')} onChange={(e) => setEdit({ ...edit, varieties: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="狀態">
            <button className="btn block" onClick={() => setEdit({ ...edit, active: !edit.active })}>{edit.active ? '啟用中（點擊停用）' : '已停用（點擊啟用）'}</button>
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ---------------- 客戶 / 床位 ----------------
function SimpleList({ table, title }: { table: 'locations'; title: string }) {
  const rows = useLiveQuery(() => db[table].orderBy('name').filter((r) => !r.deleted).toArray(), [table]) ?? []
  const toast = useToast()
  const add = async () => {
    const name = window.prompt(`新增${title}`)?.trim()
    if (!name) return
    await putMaster(table, { id: uid(), name, active: true })
  }
  const rename = async (id: string, cur: string) => {
    const name = window.prompt('修改名稱', cur)?.trim()
    const row = await db[table].get(id)
    if (!name || !row) return
    await putMaster(table, { ...row, name })
  }
  const toggle = async (id: string, active: boolean) => {
    const row = await db[table].get(id)
    if (!row) return
    await putMaster(table, { ...row, active: !active })
    toast(active ? '已停用' : '已啟用')
  }
  const remove = async (id: string, name: string) => {
    const row = await db[table].get(id)
    if (!row || !confirm(`刪除「${name}」？`)) return
    await putMaster(table, { ...row, deleted: 1 })
    toast('已刪除')
  }
  return (
    <>
      <TopBar title={title} onBack={back} right={<button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={add}>＋</button>} />
      <main className="page">
        {rows.length === 0 && <div className="card empty">尚無資料，按右上角 ＋ 新增</div>}
        {rows.length > 0 && (
          <div className="card" style={{ padding: '2px 14px' }}>
            {rows.map((r: any) => (
              <div key={r.id} className="list-item">
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', fontWeight: 700, opacity: r.active ? 1 : .5, padding: 0 }} onClick={() => rename(r.id, r.name)}>{r.name}</button>
                <button className="btn sm" onClick={() => toggle(r.id, r.active)}>{r.active ? '停用' : '啟用'}</button>
                <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => remove(r.id, r.name)}>刪</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ---------------- 同步 / 匯出 ----------------
function Sync() {
  const toast = useToast()
  const [s, setS] = useState<AppSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useLiveQuery(() => db.syncQueue.count(), []) ?? 0
  useEffect(() => { getSettings().then(setS) }, [])
  if (!s) return null
  const set = (patch: Partial<AppSettings>) => setS({ ...s, ...patch })
  const save = async () => { await saveSettings(s); toast('已儲存設定') }
  const sync = async () => {
    await saveSettings(s)
    setBusy(true)
    const r = await runSync()
    setBusy(false)
    if (!r) return toast('請先填入雲端設定')
    if (r.ok) { toast(`同步完成：上傳 ${r.pushed}、下載 ${r.pulled}`); setS(await getSettings()) }
    else toast('同步失敗：' + r.error)
  }
  const shareLink = async () => {
    await saveSettings(s)
    const url = await buildSetupLink()
    if (!url) return toast('請先填入 Apps Script 網址')
    if (navigator.share) { try { await navigator.share({ title: '育苗排程 團隊設定連結', url }); return } catch { /* cancelled */ } }
    await navigator.clipboard.writeText(url)
    toast('已複製設定連結，傳給同事開啟即可')
  }
  const csv = async (kind: 'batches' | 'orders' | 'events') => {
    const content = kind === 'batches' ? await buildBatchCsv() : kind === 'orders' ? await buildOrderCsv() : await buildEventCsv()
    const names = { batches: '批次', orders: '出貨明細', events: '作業紀錄' }
    const r = await shareOrDownload(`${names[kind]}_${today()}.csv`, content)
    if (r === 'downloaded') toast('已下載 CSV')
  }
  return (
    <>
      <TopBar title="雲端同步 / 匯出" onBack={back} />
      <main className="page">
        <div className="section-title">匯出 CSV（可直接存到 Google Drive / 傳 LINE）</div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn" onClick={() => csv('batches')}>📄 批次</button>
          <button className="btn" onClick={() => csv('orders')}>📄 出貨明細</button>
          <button className="btn" onClick={() => csv('events')}>📄 作業紀錄</button>
        </div>

        <div className="section-title">方案 A：Google Sheets（免費，建議）</div>
        <div className="card">
          <div className="muted" style={{ marginBottom: 10 }}>設定後每次操作會自動上傳；同事開啟你分享的「設定連結」即可共用同一份雲端資料。</div>
          <Field label="Apps Script 網頁應用程式網址" hint="部署方式見 docs/google-apps-script.md">
            <input value={s.sheetsWebhookUrl ?? ''} onChange={(e) => set({ sheetsWebhookUrl: e.target.value.trim() })} placeholder="https://script.google.com/macros/s/.../exec" inputMode="url" />
          </Field>
          <Field label="共用密語（Token）">
            <input value={s.sheetsToken ?? ''} onChange={(e) => set({ sheetsToken: e.target.value })} placeholder="與 Apps Script 內 TOKEN 相同" />
          </Field>
          <button className="btn block" onClick={shareLink}>🔗 分享團隊設定連結給同事</button>
        </div>

        <div className="section-title">方案 B：Supabase（免費層，選用）</div>
        <div className="card">
          <Field label="Project URL"><input value={s.supabaseUrl ?? ''} onChange={(e) => set({ supabaseUrl: e.target.value.trim() })} placeholder="https://xxxx.supabase.co" inputMode="url" /></Field>
          <Field label="anon public key" hint="建表 SQL 見 docs/supabase.sql"><input value={s.supabaseAnonKey ?? ''} onChange={(e) => set({ supabaseAnonKey: e.target.value.trim() })} /></Field>
        </div>

        <div className="btn-row">
          <button className="btn" onClick={save}>儲存設定</button>
          <button className="btn primary" onClick={sync} disabled={busy}>{busy ? '同步中…' : `🔄 立即同步（${pending} 筆）`}</button>
        </div>
        {s.lastSyncAt && <div className="muted" style={{ textAlign: 'center', marginTop: 10 }}>上次同步：{localDateTime(s.lastSyncAt)}</div>}
      </main>
    </>
  )
}

// ---------------- 備份 ----------------
function Backup() {
  const toast = useToast()
  const doExport = async () => {
    const data = await exportAll()
    const r = await shareOrDownload(`nursery-backup_${today()}.json`, JSON.stringify(data), 'application/json')
    if (r === 'downloaded') toast('已下載備份')
  }
  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!confirm(`還原 ${data.batches?.length ?? 0} 筆批次、${data.events?.length ?? 0} 筆紀錄？（同 ID 會被覆蓋）`)) return
        await importAll(data)
        toast('還原完成')
      } catch (e) {
        toast('檔案格式錯誤')
      }
    }
    reader.readAsText(file)
  }
  const wipe = async () => {
    if (!confirm('確定清除本機所有資料？（雲端資料不受影響）')) return
    if (!confirm('再次確認：此動作無法復原')) return
    await Promise.all([db.batches.clear(), db.events.clear(), db.syncQueue.clear()])
    toast('已清除')
  }
  return (
    <>
      <TopBar title="備份與還原" onBack={back} />
      <main className="page">
        <div className="card">
          <button className="btn block" onClick={doExport}>⬇ 匯出完整備份（JSON）</button>
          <label className="btn block" style={{ marginTop: 10 }}>
            ⬆ 從備份還原
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          </label>
        </div>
        <div className="card">
          <div className="muted" style={{ marginBottom: 10 }}>清除本機批次與紀錄（主檔與設定保留）</div>
          <button className="btn danger block" onClick={wipe}>清除本機資料</button>
        </div>
      </main>
    </>
  )
}
