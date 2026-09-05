import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { fullDate, today } from '../lib/dates'
import { seedlingAge } from '../lib/schedule'
import { STATUS_LABEL, type Batch, type BatchStatus } from '../lib/types'
import { TopBar } from '../components/ui'
import { SyncBadge } from '../components/SyncBadge'

type Filter = 'active' | 'ready' | 'shipped' | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'active', label: '育苗中' }, { v: 'ready', label: '可出貨' }, { v: 'shipped', label: '已出貨' }, { v: 'all', label: '全部' },
]

export function statusBadge(s: BatchStatus) {
  const cls = s === 'ready' ? 'warn' : s === 'shipped' ? 'gray' : s === 'cancelled' ? 'danger' : s === 'planned' ? 'info' : ''
  return <span className={'badge ' + cls}>{STATUS_LABEL[s]}</span>
}

export default function Batches() {
  const t = today()
  const [filter, setFilter] = useState<Filter>('active')
  const [q, setQ] = useState('')
  const all = useLiveQuery(() => db.batches.filter((b) => !b.deleted).toArray(), []) ?? []

  const list = all
    .filter((b) => {
      if (filter === 'active') return !['shipped', 'cancelled', 'ready'].includes(b.status)
      if (filter === 'ready') return b.status === 'ready' || (b.readyDate <= t && !['shipped', 'cancelled'].includes(b.status))
      if (filter === 'shipped') return b.status === 'shipped'
      return true
    })
    .filter((b) => !q || [b.id, b.cropName, b.variety, b.customerName, b.locationName].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (filter === 'shipped' ? (b.actualShipDate ?? '').localeCompare(a.actualShipDate ?? '') : a.targetShipDate.localeCompare(b.targetShipDate)))

  return (
    <>
      <TopBar title="批次" sub={`${list.length} 筆`} right={<SyncBadge />} />
      <main className="page">
        <div className="field" style={{ marginBottom: 8 }}>
          <input type="search" placeholder="搜尋批號 / 作物 / 客戶 / 床位" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.v} className={'chip' + (filter === f.v ? ' on' : '')} onClick={() => setFilter(f.v)}>{f.label}</button>
          ))}
        </div>
        {list.length === 0 && <div className="card empty">沒有符合的批次<br />按右下角 + 新增</div>}
        {list.map((b) => <BatchCard key={b.id} b={b} t={t} />)}
      </main>
    </>
  )
}

function BatchCard({ b, t }: { b: Batch; t: string }) {
  const age = seedlingAge(b, t)
  const total = Math.max(1, (b.readyDate > b.sowDate ? daysBetween(b.sowDate, b.readyDate) : 1))
  const pct = Math.min(100, Math.max(0, Math.round((age / total) * 100)))
  const done = b.status === 'shipped' || b.status === 'cancelled'
  return (
    <a className="card tappable" href={`#/batch/${b.id}`}>
      <div className="row between">
        <div className="grow">
          <div className="title truncate">{b.cropName} {b.variety}</div>
          <div className="muted truncate">{b.id} · {b.trayCells}穴 × {b.trayCount} 盤 · {b.customerName || '未指定客戶'}</div>
        </div>
        {statusBadge(b.status)}
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        <div className="row between"><span>播種 {fullDate(b.actualSowDate ?? b.sowDate)}</span>{!done && <span>苗齡 {age >= 0 ? age : 0} 天</span>}</div>
        <div>{done ? `出貨 ${fullDate(b.actualShipDate)}` : `交苗 ${fullDate(b.targetShipDate)}`}</div>
      </div>
      {!done && <div className="progress"><div style={{ width: pct + '%' }} /></div>}
    </a>
  )
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
