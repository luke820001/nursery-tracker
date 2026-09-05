import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { byOrder, db, putBatch, putMaster } from '../lib/db'
import { addDays, fullDate, nowIso, today } from '../lib/dates'
import { backward, forward, nextBatchId, paramsFromCrop, targetPlants } from '../lib/schedule'
import { DELIVERY_LABEL, DELIVERY_OPTIONS, TRAY_SPECS, type Batch, type Crop, type DeliveryMethod } from '../lib/types'
import { uid } from '../lib/id'
import { Chips, Field, Segment, Stepper, TopBar, back, go, useToast } from '../components/ui'

type Mode = 'backward' | 'forward'

export default function BatchForm({ id }: { id?: string }) {
  const toast = useToast()
  const crops = useLiveQuery(async () => (await db.crops.filter((c) => c.active).toArray()).sort(byOrder), []) ?? []
  const customers = useLiveQuery(() => db.customers.filter((c) => c.active).sortBy('name'), []) ?? []
  const locations = useLiveQuery(() => db.locations.filter((c) => c.active).sortBy('name'), []) ?? []
  const existing = useLiveQuery<Batch | undefined>(async () => (id ? db.batches.get(id) : undefined), [id])

  const [mode, setMode] = useState<Mode>('backward')
  const [cropId, setCropId] = useState('')
  const [variety, setVariety] = useState('')
  const [trayCells, setTrayCells] = useState(128)
  const [trayCount, setTrayCount] = useState(10)
  const [lossPct, setLossPct] = useState(5)
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup')
  const [unitPrice, setUnitPrice] = useState(0)
  const [anchorDate, setAnchorDate] = useState(addDays(today(), 30))
  const [bufferDays, setBufferDays] = useState(0)
  const [seedlingDays, setSeedlingDays] = useState(28)
  const [note, setNote] = useState('')
  const [loaded, setLoaded] = useState(false)

  const crop: Crop | undefined = crops.find((c) => c.id === cropId)

  // 載入既有批次（編輯模式）
  useEffect(() => {
    if (id && existing && !loaded) {
      setCropId(existing.cropId); setVariety(existing.variety); setTrayCells(existing.trayCells)
      setTrayCount(existing.trayCount); setLossPct(Math.round(existing.expectedLossRate * 100))
      setCustomerId(existing.customerId ?? ''); setCustomerName(existing.customerName)
      setLocationId(existing.locationId ?? ''); setAnchorDate(existing.targetShipDate)
      setDelivery(existing.deliveryMethod ?? 'pickup'); setUnitPrice(existing.unitPrice ?? 0)
      setSeedlingDays(Math.max(1, dayDiff(existing.sowDate, existing.readyDate)))
      setBufferDays(dayDiff(existing.readyDate, existing.targetShipDate)); setNote(existing.note ?? '')
      setLoaded(true)
    }
  }, [id, existing, loaded])

  // 新增模式：第一次載入作物時帶入預設
  useEffect(() => {
    if (!id && !cropId && crops.length) applyCrop(crops[0])
  }, [crops, id, cropId])

  function applyCrop(c: Crop) {
    setCropId(c.id)
    setTrayCells(c.defaultTrayCells)
    setLossPct(Math.round(c.expectedLossRate * 100))
    setSeedlingDays(c.seedlingDays)
    setVariety(c.varieties[0] ?? '')
  }

  const params = useMemo(() => {
    const base = crop ? paramsFromCrop(crop, bufferDays) : { seedlingDays, soakDays: 0, hardenDays: 5, bufferDays }
    return { ...base, seedlingDays }
  }, [crop, bufferDays, seedlingDays])

  const sched = useMemo(() => (mode === 'backward' ? backward(anchorDate, params) : forward(anchorDate, params)), [mode, anchorDate, params])
  const plants = targetPlants(trayCells, trayCount, lossPct / 100)

  async function save() {
    if (!crop) return toast('請先選擇作物')
    if (trayCount <= 0) return toast('盤數需大於 0')
    const ids = (await db.batches.toArray()).map((b) => b.id)
    const cust = customers.find((c) => c.id === customerId)
    const loc = locations.find((l) => l.id === locationId)
    const b: Batch = {
      ...(existing ?? { id: nextBatchId(ids, sched.sowDate), status: 'planned', lossTrays: 0, orderDate: today(), createdAt: nowIso() }),
      cropId: crop.id, cropName: crop.name, variety, trayCells, trayCount,
      expectedLossRate: lossPct / 100, targetPlants: plants,
      customerId: cust?.id, customerName: cust?.name ?? customerName,
      locationId: loc?.id, locationName: loc?.name ?? '',
      deliveryMethod: delivery, unitPrice: unitPrice || undefined,
      soakDate: sched.soakDate, sowDate: sched.sowDate, hardenDate: sched.hardenDate,
      readyDate: sched.readyDate, targetShipDate: sched.targetShipDate,
      note, updatedAt: nowIso(),
    } as Batch
    await putBatch(b)
    toast(existing ? '已更新' : `已建立 ${b.id}`)
    go(`/batch/${b.id}`)
  }

  async function quickAdd(kind: 'customer' | 'location') {
    const name = window.prompt(kind === 'customer' ? '新客戶名稱' : '新床位名稱')?.trim()
    if (!name) return
    const row = { id: uid(), name, active: true }
    if (kind === 'customer') { await putMaster('customers', { ...row, deliveryMethod: delivery }); setCustomerId(row.id) }
    else { await putMaster('locations', row); setLocationId(row.id) }
  }

  return (
    <>
      <TopBar title={id ? `編輯 ${id}` : '新增批次'} onBack={back} />
      <main className="page">
        <Field label="作物">
          <select value={cropId} onChange={(e) => { const c = crops.find((x) => x.id === e.target.value); if (c) applyCrop(c) }}>
            {crops.map((c) => <option key={c.id} value={c.id}>{c.name}（苗期 {c.seedlingDays} 天）</option>)}
          </select>
        </Field>

        <Field label="品種">
          <input list="variety-list" value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="選擇或輸入品種" />
          <datalist id="variety-list">{(crop?.varieties ?? []).map((v) => <option key={v} value={v} />)}</datalist>
        </Field>

        <Field label="穴盤規格">
          <Chips options={TRAY_SPECS} value={trayCells} onChange={setTrayCells} labels={(v) => `${v}穴`} />
        </Field>

        <div className="grid2">
          <Field label="盤數"><Stepper value={trayCount} onChange={setTrayCount} min={0} /></Field>
          <Field label="預估損耗 %"><Stepper value={lossPct} onChange={setLossPct} min={0} /></Field>
        </div>
        <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
          預計育成 <b className="big">{plants.toLocaleString()}</b> 株
          <span className="muted">（{trayCells} × {trayCount} × {100 - lossPct}%）</span>
        </div>

        <Field label="客戶">
          <div className="row">
            <select className="grow" value={customerId} style={{ flex: 1 }}
              onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c?.deliveryMethod) setDelivery(c.deliveryMethod) }}>
              <option value="">— 未指定 —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn sm" onClick={() => quickAdd('customer')}>＋</button>
          </div>
        </Field>

        <Field label="交貨方式">
          <Chips options={DELIVERY_OPTIONS} value={delivery} onChange={setDelivery} labels={(v) => DELIVERY_LABEL[v]} />
        </Field>

        <Field label="單價（元 / 盤，選填）" hint={unitPrice ? `預估金額 ${(unitPrice * trayCount).toLocaleString()} 元` : undefined}>
          <input type="number" inputMode="decimal" value={unitPrice || ''} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} placeholder="0" />
        </Field>

        <Field label="溫室 / 床位">
          <div className="row">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ flex: 1 }}>
              <option value="">— 未分配 —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" className="btn sm" onClick={() => quickAdd('location')}>＋</button>
          </div>
        </Field>

        <div className="section-title">排程</div>
        <Segment<Mode> value={mode} onChange={setMode} options={[{ v: 'backward', label: '由交苗日倒推' }, { v: 'forward', label: '由播種日順推' }]} />
        <Field label={mode === 'backward' ? '目標交苗日' : '預計播種日'}>
          <input type="date" value={anchorDate} onChange={(e) => e.target.value && setAnchorDate(e.target.value)} />
        </Field>
        <div className="grid2">
          <Field label="苗期天數"><Stepper value={seedlingDays} onChange={setSeedlingDays} min={1} /></Field>
          <Field label="安全緩衝天數"><Stepper value={bufferDays} onChange={setBufferDays} min={0} /></Field>
        </div>

        <div className="card">
          <div className="kv dates">
            {sched.soakDate && <><div className="k">浸種/催芽</div><div className="v">{fullDate(sched.soakDate)}</div></>}
            <div className="k">播種日</div><div className="v">{fullDate(sched.sowDate)}</div>
            <div className="k">開始健化</div><div className="v">{fullDate(sched.hardenDate)}</div>
            <div className="k">可出貨日</div><div className="v">{fullDate(sched.readyDate)}</div>
            <div className="k">目標交苗日</div><div className="v" style={{ color: 'var(--primary)' }}>{fullDate(sched.targetShipDate)}</div>
          </div>
          {sched.sowDate < today() && !id && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>⚠ 播種日已過，請調整交苗日或苗期</div>}
        </div>

        <Field label="備註">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：客戶要求 288 穴改 200 穴" />
        </Field>

        <div className="btn-row">
          <button className="btn" onClick={back}>取消</button>
          <button className="btn primary" onClick={save}>{id ? '儲存' : '建立批次'}</button>
        </div>
      </main>
    </>
  )
}

function dayDiff(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
