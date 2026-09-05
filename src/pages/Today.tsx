import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { addDays, fullDate, lunar, today, weekday } from '../lib/dates'
import { buildTodos, type TodoItem } from '../lib/schedule'
import { completeMilestone, MILESTONE_LABEL } from '../lib/actions'
import { Field, Sheet, TopBar, go, useToast } from '../components/ui'
import type { Batch } from '../lib/types'
import { SyncBadge } from '../components/SyncBadge'

export default function Today() {
  const t = today()
  const toast = useToast()
  const batches = useLiveQuery(() => db.batches.filter((b) => !b.deleted).toArray(), []) ?? []
  const [doing, setDoing] = useState<TodoItem | null>(null)
  const [date, setDate] = useState(t)

  const todos = buildTodos(batches, t)
  const upcoming = buildTodos(batches, t, 7).filter((x) => x.dueDate > t)
  const active = batches.filter((b) => !['shipped', 'cancelled'].includes(b.status))
  const weekShip = active.filter((b) => b.targetShipDate >= t && b.targetShipDate <= addDays(t, 6))
  const overdue = todos.filter((x) => x.overdueDays > 0).length

  const openDo = (item: TodoItem) => {
    if (item.action === 'ship') return go(`/batch/${item.batch.id}`) // 出貨需選交貨對象，到詳情頁處理
    setDoing(item)
    setDate(t)
  }
  const doIt = async () => {
    if (!doing) return
    await completeMilestone(doing.batch, doing.action, date)
    toast(`${doing.batch.id} 已完成${MILESTONE_LABEL[doing.action]}`)
    setDoing(null)
  }

  return (
    <>
      <TopBar title={`${t}（${weekday(t)}）`} sub={`農曆${lunar(t)}`} right={<SyncBadge />} />
      <main className="page">
        <div className="stat-grid">
          <div className="stat"><div className="n">{todos.length}</div><div className="l">今日待辦</div></div>
          <div className="stat"><div className="n">{active.length}</div><div className="l">育苗中批次</div></div>
          <div className="stat"><div className="n">{weekShip.length}</div><div className="l">本週出貨</div></div>
        </div>

        <div className="section-title">待辦{overdue ? `（${overdue} 項逾期）` : ''}</div>
        {todos.length === 0 && <div className="card empty">今天沒有到期作業 🎉</div>}
        {todos.map((item) => <TodoCard key={item.batch.id + item.action} item={item} onDo={() => openDo(item)} />)}

        {upcoming.length > 0 && (
          <>
            <div className="section-title">未來 7 天</div>
            {upcoming.map((item) => (
              <a key={item.batch.id + item.action} className="card tappable" href={`#/batch/${item.batch.id}`}>
                <div className="row between">
                  <div className="grow">
                    <div className="title truncate">{item.batch.cropName} {item.batch.variety} · {item.batch.customerName || '—'}</div>
                    <div className="muted">{item.batch.id} · {item.batch.trayCount} 盤 · {fullDate(item.dueDate)}</div>
                  </div>
                  <span className="badge info">{MILESTONE_LABEL[item.action]}</span>
                </div>
              </a>
            ))}
          </>
        )}
      </main>

      {doing && (
        <Sheet title={`${MILESTONE_LABEL[doing.action]}：${doing.batch.id}`} onClose={() => setDoing(null)}>
          <div className="muted" style={{ marginBottom: 12 }}>
            {doing.batch.cropName} {doing.batch.variety} · {doing.batch.trayCount} 盤 · {doing.batch.customerName || '無客戶'}
          </div>
          <Field label="實際日期">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setDoing(null)}>取消</button>
            <button className="btn primary" onClick={doIt}>確認完成</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function TodoCard({ item, onDo }: { item: TodoItem; onDo: () => void }) {
  const b: Batch = item.batch
  const late = item.overdueDays > 0
  return (
    <div className="card">
      <div className="row between">
        <a className="grow" href={`#/batch/${b.id}`}>
          <div className="title truncate">{b.cropName} {b.variety}</div>
          <div className="muted truncate">{b.id} · {b.trayCount} 盤 · {b.customerName || '未指定客戶'} · {b.locationName || '未分配床位'}</div>
        </a>
        <span className={'badge ' + (late ? 'danger' : 'warn')}>
          {late ? `逾期 ${item.overdueDays} 天` : '今日'}
        </span>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>預計{MILESTONE_LABEL[item.action]} {fullDate(item.dueDate)}</div>
      <div className="btn-row">
        <button className="btn primary" onClick={onDo}>{item.action === 'ship' ? '🚚 出貨…' : `✓ 完成${MILESTONE_LABEL[item.action]}`}</button>
      </div>
    </div>
  )
}
