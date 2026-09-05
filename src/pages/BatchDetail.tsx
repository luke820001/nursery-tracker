import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, softDeleteBatch, softDeleteEvent } from '../lib/db'
import { fullDate, today } from '../lib/dates'
import { actualLossRate, seedlingAge } from '../lib/schedule'
import { batchAmount, pendingOrders, shippedTrays } from '../lib/orders'
import { addEvent, completeMilestone, finishShipping, MILESTONE_LABEL, setStatus, shipOrder, type Milestone } from '../lib/actions'
import { DELIVERY_LABEL, EVENT_LABEL, type Batch, type EventType } from '../lib/types'
import { Chips, Field, Sheet, Stepper, TopBar, back, confirm, go, useToast } from '../components/ui'
import { statusBadge } from './Batches'

const QUICK_EVENTS: EventType[] = ['loss', 'water', 'fertilize', 'pest', 'move', 'inspect', 'note']

export default function BatchDetail({ id }: { id: string }) {
  const toast = useToast()
  const t = today()
  const b = useLiveQuery(() => db.batches.get(id), [id])
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? []
  const events = useLiveQuery(() => db.events.where('batchId').equals(id).filter((e) => !e.deleted).reverse().sortBy('date'), [id]) ?? []
  const [ms, setMs] = useState<Milestone | null>(null)
  const [msDate, setMsDate] = useState(t)
  // 出貨抽屜
  const [shipping, setShipping] = useState(false)
  const [shipOrderId, setShipOrderId] = useState('')
  const [shipQty, setShipQty] = useState(0)
  const [shipDate, setShipDate] = useState(t)
  // 作業紀錄抽屜
  const [adding, setAdding] = useState(false)
  const [evType, setEvType] = useState<EventType>('loss')
  const [evDate, setEvDate] = useState(t)
  const [evQty, setEvQty] = useState(1)
  const [evNote, setEvNote] = useState('')

  if (!b) return <><TopBar title="訂單" onBack={back} /><main className="page"><div className="empty">找不到訂單</div></main></>

  const done = b.status === 'shipped' || b.status === 'cancelled'
  const lossRate = actualLossRate(b)
  const orders = b.orders ?? []
  const pending = pendingOrders(b)
  const shipped = shippedTrays(b)
  const amount = batchAmount(b)
  const custOf = (cid?: string) => customers.find((c) => c.id === cid)

  const openMs = (m: Milestone) => {
    if (m === 'ship') return openShip()
    setMs(m); setMsDate(t)
  }
  const doMs = async () => {
    if (!ms) return
    await completeMilestone(b, ms, msDate)
    toast(`已完成${MILESTONE_LABEL[ms]}`)
    setMs(null)
  }
  const openShip = (orderId?: string) => {
    const o = orderId ? orders.find((x) => x.id === orderId) : pending[0]
    setShipOrderId(o?.id ?? '')
    setShipQty(o ? Math.max(0, o.trays - o.shippedTrays) : Math.max(0, b.trayCount - b.lossTrays - shipped))
    setShipDate(t)
    setShipping(true)
  }
  const doShip = async () => {
    if (orders.length === 0) {
      await finishShipping(b, shipDate, shipQty)
      toast('已出貨')
    } else {
      const o = orders.find((x) => x.id === shipOrderId)
      if (!o) return toast('請選擇交貨對象')
      if (shipQty <= 0) return toast('盤數需大於 0')
      const fresh = await shipOrder(b, o.id, shipQty, shipDate)
      toast(fresh.status === 'shipped' ? '全部出貨完成' : `已出貨給 ${o.customerName} ${shipQty} 盤`)
    }
    setShipping(false)
  }
  const closeOut = async () => {
    if (!confirm('剩餘未出貨的交貨對象不再出貨，將此訂單結案？')) return
    await finishShipping(b, t)
    toast('已結案')
  }
  const saveEvent = async () => {
    await addEvent(b.id, evType, evDate, ['loss', 'move'].includes(evType) ? evQty : undefined, evNote || undefined)
    toast('已記錄')
    setAdding(false); setEvNote(''); setEvQty(1)
  }
  const remove = async () => {
    if (!confirm(`刪除訂單 ${b.id}？\n\n資料會從清單中移除且無法在 App 內復原。\n若只是這筆不做了，請改用「取消訂單」。`)) return
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
  const shipOrderObj = orders.find((o) => o.id === shipOrderId)

  return (
    <>
      <TopBar title={b.id} sub={`${b.cropName} ${b.variety}`} onBack={back}
        right={<button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={() => go(`/batch/${b.id}/edit`)}>編輯</button>} />
      <main className="page">
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="title">{b.cropName} {b.variety}</div>
            {statusBadge(b.status)}
          </div>
          <div className="kv">
            <div className="k">穴盤 / 盤數</div><div className="v">{b.trayCells}穴 × {b.trayCount} 盤</div>
            <div className="k">預計株數</div><div className="v">{b.targetPlants.toLocaleString()}</div>
            <div className="k">床位</div><div className="v">{b.locationName || '—'}</div>
            <div className="k">苗齡</div><div className="v">{done ? '—' : `${Math.max(0, seedlingAge(b, t))} 天`}</div>
            <div className="k">累計損耗</div>
            <div className="v" style={{ color: lossRate > b.expectedLossRate ? 'var(--danger)' : undefined }}>
              {b.lossTrays} 盤（{(lossRate * 100).toFixed(1)}%）
            </div>
            {(shipped > 0 || b.status === 'shipped') && <><div className="k">已出貨</div><div className="v">{b.shippedTrays ?? shipped} 盤</div></>}
            {amount > 0 && <><div className="k">金額</div><div className="v">{amount.toLocaleString()} 元</div></>}
          </div>
          {b.note && <div className="muted" style={{ marginTop: 10 }}>📝 {b.note}</div>}
        </div>

        <div className="section-title">交貨對象（{orders.length}）</div>
        <div className="card">
          {orders.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 6 }}>未指定客戶，按右上角「編輯」加入</div>}
          {orders.map((o) => {
            const c = custOf(o.customerId)
            const doneO = o.shippedTrays >= o.trays
            return (
              <div key={o.id} className="list-item">
                <div className="grow">
                  <div><b>{o.customerName}</b> <span>{o.trays} 盤</span> <span className="muted">· {DELIVERY_LABEL[o.deliveryMethod]}{o.unitPrice ? ` · ${o.unitPrice} 元/盤` : ''}</span></div>
                  <div className="muted truncate">
                    {doneO ? `✅ 已出貨 ${o.shippedTrays} 盤（${fullDate(o.shippedDate)}）` : o.shippedTrays ? `已出 ${o.shippedTrays} / ${o.trays} 盤` : '未出貨'}
                    {c?.address && o.deliveryMethod === 'deliver' && <> · 📍 {c.address}</>}
                  </div>
                </div>
                {c?.phone && <a className="btn sm" href={`tel:${c.phone}`}>📞</a>}
                {!doneO && !done && <button className="btn sm primary" onClick={() => openShip(o.id)}>出貨</button>}
              </div>
            )
          })}
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
                    {isNext && <button className="btn sm primary" onClick={() => openMs(x.m)}>{x.m === 'ship' ? '出貨' : '完成'}</button>}
                  </div>
                </Row>
              )
            })}
          </div>
          {!done && shipped > 0 && pending.length > 0 && (
            <button className="btn block" style={{ marginTop: 6 }} onClick={closeOut}>剩餘不出貨，結案</button>
          )}
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
                <b>{EVENT_LABEL[e.type]}</b>{e.customerName && <span> → {e.customerName}</span>}{e.qty !== undefined && <span> {e.qty} 盤</span>}
                <div className="muted">{fullDate(e.date)}{e.note && ` · ${e.note}`}</div>
              </div>
              {!['soak', 'sow', 'harden', 'ship'].includes(e.type) && (
                <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={async () => { if (confirm('刪除此紀錄？')) await softDeleteEvent(e.id) }}>刪</button>
              )}
            </div>
          ))}
        </div>

        {b.status === 'cancelled' && (
          <div className="card" style={{ background: 'var(--danger-soft)', borderColor: 'transparent', marginTop: 16 }}>
            <div className="row between">
              <div className="grow" style={{ color: 'var(--danger)', fontWeight: 700 }}>此訂單已取消（紀錄保留，可恢復）</div>
              <button className="btn sm" onClick={() => setStatus(b, 'planned')}>恢復</button>
            </div>
          </div>
        )}
        <div className="section-title">其他</div>
        <div className="card">
          {!done && (
            <>
              <button className="btn block" onClick={async () => { if (confirm(`取消訂單 ${b.id}？\n\n訂單會標示為「取消」，紀錄保留，之後可以恢復。`)) { await setStatus(b, 'cancelled'); toast('已取消訂單') } }}>🚫 取消訂單（保留紀錄，可恢復）</button>
              <div className="muted" style={{ margin: '6px 2px 14px' }}>客戶不種了、延期或改單時用這個；訂單仍留在「全部」清單中。</div>
            </>
          )}
          <button className="btn danger block" onClick={remove}>🗑 刪除訂單（完全移除）</button>
          <div className="muted" style={{ margin: '6px 2px 0' }}>建錯單才用這個；刪除後不會出現在任何清單，也會同步刪除給其他人。</div>
        </div>
      </main>

      {ms && (
        <Sheet title={`完成${MILESTONE_LABEL[ms]}`} onClose={() => setMs(null)}>
          <Field label="實際日期"><input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} /></Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setMs(null)}>取消</button>
            <button className="btn primary" onClick={doMs}>確認</button>
          </div>
        </Sheet>
      )}

      {shipping && (
        <Sheet title="出貨" onClose={() => setShipping(false)}>
          {orders.length > 0 && (
            <Field label="交貨對象">
              <Chips options={orders.map((o) => o.id)} value={shipOrderId}
                onChange={(oid) => { const o = orders.find((x) => x.id === oid)!; setShipOrderId(oid); setShipQty(Math.max(0, o.trays - o.shippedTrays)) }}
                labels={(oid) => { const o = orders.find((x) => x.id === oid)!; return `${o.customerName}${o.shippedTrays >= o.trays ? ' ✓' : ''}` }} />
            </Field>
          )}
          <Field label="出貨盤數" hint={shipOrderObj ? `${shipOrderObj.customerName} 預定 ${shipOrderObj.trays} 盤，已出 ${shipOrderObj.shippedTrays} 盤 · ${DELIVERY_LABEL[shipOrderObj.deliveryMethod]}` : `總盤數 ${b.trayCount}，損耗 ${b.lossTrays} 盤`}>
            <Stepper value={shipQty} onChange={setShipQty} min={0} />
          </Field>
          <Field label="出貨日期"><input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setShipping(false)}>取消</button>
            <button className="btn primary" onClick={doShip}>確認出貨</button>
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
