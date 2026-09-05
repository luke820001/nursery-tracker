import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, softDeleteBatch, softDeleteEvent } from '../lib/db'
import { fullDate, today } from '../lib/dates'
import { actualLossRate, seedlingAge } from '../lib/schedule'
import { addEvent, completeMilestone, MILESTONE_LABEL, setStatus, type Milestone } from '../lib/actions'
import { DELIVERY_LABEL, EVENT_LABEL, type Batch, type EventType } from '../lib/types'
import { Chips, Field, Sheet, Stepper, TopBar, back, confirm, go, useToast } from '../components/ui'
import { statusBadge } from './Batches'

const QUICK_EVENTS: EventType[] = ['loss', 'water', 'fertilize', 'pest', 'move', 'inspect', 'note']

export default function BatchDetail({ id }: { id: string }) {
  const toast = useToast()
  const t = today()
  const b = useLiveQuery(() => db.batches.get(id), [id])
  const customer = useLiveQuery(async () => (b?.customerId ? db.customers.get(b.customerId) : undefined), [b?.customerId])
  const events = useLiveQuery(() => db.events.where('batchId').equals(id).filter((e) => !e.deleted).reverse().sortBy('date'), [id]) ?? []
  const [ms, setMs] = useState<Milestone | null>(null)
  const [msDate, setMsDate] = useState(t)
  const [msQty, setMsQty] = useState(0)
  const [adding, setAdding] = useState(false)
  const [evType, setEvType] = useState<EventType>('loss')
  const [evDate, setEvDate] = useState(t)
  const [evQty, setEvQty] = useState(1)
  const [evNote, setEvNote] = useState('')

  if (!b) return <><TopBar title="批次" onBack={back} /><main className="page"><div className="empty">找不到批次</div></main></>

  const done = b.status === 'shipped' || b.status === 'cancelled'
  const lossRate = actualLossRate(b)

  const openMs = (m: Milestone) => {
    setMs(m); setMsDate(t); setMsQty(Math.max(0, b.trayCount - b.lossTrays))
  }
  const doMs = async () => {
    if (!ms) return
    await completeMilestone(b, ms, msDate, ms === 'ship' ? msQty : undefined)
    toast(`已完成${MILESTONE_LABEL[ms]}`)
    setMs(null)
  }
  const saveEvent = async () => {
    await addEvent(b.id, evType, evDate, ['loss', 'move'].includes(evType) ? evQty : undefined, evNote || undefined)
    toast('已記錄')
    setAdding(false); setEvNote(''); setEvQty(1)
  }
  const remove = async () => {
    if (!confirm(`刪除批次 ${b.id}？`)) return
    await softDeleteBatch(b.id)
    go('/batches')
  }

  type MsRow = { m: Milestone; plan?: string; actual?: string; rankDone: boolean }
  const allMs: MsRow[] = [
    { m: 'soak', plan: b.soakDate, actual: b.actualSoakDate, rankDone: !!b.actualSoakDate || ['sown', 'growing', 'hardening', 'ready', 'shipped'].includes(b.status) },
    { m: 'sow', plan: b.sowDate, actual: b.actualSowDate, rankDone: !!b.actualSowDate || ['growing', 'hardening', 'ready', 'shipped'].includes(b.status) },
    { m: 'harden', plan: b.hardenDate, actual: b.actualHardenDate, rankDone: !!b.actualHardenDate || ['ready', 'shipped'].includes(b.status) },
    { m: 'ship', plan: b.targetShipDate, actual: b.actualShipDate, rankDone: b.status === 'shipped' },
  ]
  const milestones = allMs.filter((x) => x.plan)
  const nextIdx = milestones.findIndex((x) => !x.rankDone)

  return (
    <>
      <TopBar title={b.id} sub={`${b.cropName} ${b.variety}`} onBack={back}
        right={<button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={() => go(`/batch/${b.id}/edit`)}>編輯</button>} />
      <main className="page">
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}>
            <div className="title">{b.customerName || '無客戶'}</div>
            {statusBadge(b.status)}
          </div>
          {(b.deliveryMethod || customer?.phone || customer?.address) && (
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="grow muted">
                {b.deliveryMethod && <span>{DELIVERY_LABEL[b.deliveryMethod]}</span>}
                {customer?.address && <div className="truncate">📍 {customer.address}</div>}
              </div>
              {customer?.phone && <a className="btn sm" href={`tel:${customer.phone}`}>📞 {customer.phone}</a>}
            </div>
          )}
          <div className="kv">
            <div className="k">穴盤 / 盤數</div><div className="v">{b.trayCells}穴 × {b.trayCount} 盤</div>
            <div className="k">預計株數</div><div className="v">{b.targetPlants.toLocaleString()}</div>
            <div className="k">床位</div><div className="v">{b.locationName || '—'}</div>
            <div className="k">苗齡</div><div className="v">{done ? '—' : `${Math.max(0, seedlingAge(b, t))} 天`}</div>
            <div className="k">累計損耗</div>
            <div className="v" style={{ color: lossRate > b.expectedLossRate ? 'var(--danger)' : undefined }}>
              {b.lossTrays} 盤（{(lossRate * 100).toFixed(1)}%）
            </div>
            {b.status === 'shipped' && <><div className="k">實際出貨</div><div className="v">{b.shippedTrays} 盤</div></>}
            {b.unitPrice && <><div className="k">金額（{b.unitPrice} 元/盤）</div><div className="v">{((b.shippedTrays ?? b.trayCount) * b.unitPrice).toLocaleString()} 元</div></>}
          </div>
          {b.note && <div className="muted" style={{ marginTop: 10 }}>📝 {b.note}</div>}
        </div>

        <div className="section-title">排程進度</div>
        <div className="card">
          <div className="timeline">
            {milestones.map((x, i) => {
              const isNext = i === nextIdx && !done
              const due = isNext && x.plan! <= t
              return (
                <Row key={x.m} last={i === milestones.length - 1} dot={x.rankDone ? 'done' : due ? 'due' : ''}>
                  <div className="row between">
                    <div className="grow">
                      <div className="name">{MILESTONE_LABEL[x.m]}</div>
                      <div className="muted">
                        預計 {fullDate(x.plan)}
                        {x.actual && <><br />實際 <b>{fullDate(x.actual)}</b></>}
                      </div>
                    </div>
                    {isNext && <button className="btn sm primary" onClick={() => openMs(x.m)}>完成</button>}
                  </div>
                </Row>
              )
            })}
          </div>
        </div>

        <div className="row between">
          <div className="section-title" style={{ margin: '18px 4px 8px' }}>作業紀錄（{events.length}）</div>
          {!done && <button className="btn sm" onClick={() => { setAdding(true); setEvDate(t) }}>＋ 記錄</button>}
        </div>
        <div className="card">
          {events.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 10 }}>尚無紀錄</div>}
          {events.map((e) => (
            <div key={e.id} className="list-item">
              <div className="grow">
                <b>{EVENT_LABEL[e.type]}</b>{e.qty !== undefined && <span> {e.qty} 盤</span>}
                <div className="muted">{fullDate(e.date)}{e.note && ` · ${e.note}`}</div>
              </div>
              {!['soak', 'sow', 'harden', 'ship'].includes(e.type) && (
                <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={async () => { if (confirm('刪除此紀錄？')) await softDeleteEvent(e.id) }}>刪</button>
              )}
            </div>
          ))}
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          {!done && <button className="btn" onClick={async () => { if (confirm('取消此批次？')) { await setStatus(b, 'cancelled'); toast('已取消') } }}>取消批次</button>}
          {b.status === 'cancelled' && <button className="btn" onClick={() => setStatus(b, 'planned')}>恢復批次</button>}
          <button className="btn danger" onClick={remove}>刪除</button>
        </div>
      </main>

      {ms && (
        <Sheet title={`完成${MILESTONE_LABEL[ms]}`} onClose={() => setMs(null)}>
          <Field label="實際日期"><input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} /></Field>
          {ms === 'ship' && (
            <Field label="實際出貨盤數" hint={`總盤數 ${b.trayCount}，累計損耗 ${b.lossTrays} 盤`}>
              <Stepper value={msQty} onChange={setMsQty} />
            </Field>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setMs(null)}>取消</button>
            <button className="btn primary" onClick={doMs}>確認</button>
          </div>
        </Sheet>
      )}

      {adding && (
        <Sheet title="新增作業紀錄" onClose={() => setAdding(false)}>
          <Field label="類型">
            <Chips options={QUICK_EVENTS} value={evType} onChange={setEvType} labels={(v) => EVENT_LABEL[v]} />
          </Field>
          <Field label="日期"><input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} /></Field>
          {['loss', 'move'].includes(evType) && (
            <Field label={evType === 'loss' ? '損耗盤數' : '移動盤數'}><Stepper value={evQty} onChange={setEvQty} min={0} /></Field>
          )}
          <Field label="備註"><input value={evNote} onChange={(e) => setEvNote(e.target.value)} placeholder="選填" /></Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setAdding(false)}>取消</button>
            <button className="btn primary" onClick={saveEvent}>儲存</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Row({ dot, last, children }: { dot: string; last: boolean; children: React.ReactNode }) {
  return (
    <>
      <div className="tl-col">
        <div className={'dot ' + dot} />
        {!last && <div className="line" />}
      </div>
      <div className="tl-item">{children}</div>
    </>
  )
}

export type { Batch }
