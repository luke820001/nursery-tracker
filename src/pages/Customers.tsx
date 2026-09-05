import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, putMaster } from '../lib/db'
import { uid } from '../lib/id'
import { DELIVERY_LABEL, DELIVERY_OPTIONS, type Customer } from '../lib/types'
import { Chips, Field, Sheet, TopBar, confirm, useToast } from '../components/ui'

export default function Customers() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Customer | null>(null)
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.deleted).toArray(), []) ?? []
  const batches = useLiveQuery(() => db.batches.filter((b) => !b.deleted && b.status !== 'cancelled').toArray(), []) ?? []
  // 舊資料可能沒存 customerId，改用「id 或名稱」比對
  const ordersOf = (c: Customer) => batches.filter((b) => (b.orders ?? []).some((o) => (o.customerId ? o.customerId === c.id : o.customerName === c.name)))

  const list = customers
    .filter((c) => !q || [c.name, c.phone, c.address].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'zh-Hant'))

  const openNew = () => setEdit({ id: uid(), name: '', deliveryMethod: 'pickup', active: true })
  const save = async () => {
    if (!edit?.name.trim()) return toast('請輸入客戶姓名')
    await putMaster('customers', { ...edit, name: edit.name.trim() })
    toast('已儲存')
    setEdit(null)
  }
  const remove = async () => {
    if (!edit) return
    const open = ordersOf(edit).filter((b) => b.status !== 'shipped').length
    const msg = open ? `${edit.name} 仍有 ${open} 筆訂單育苗中，確定刪除？（訂單上的客戶名稱會保留）` : `刪除客戶 ${edit.name}？`
    if (!confirm(msg)) return
    await putMaster('customers', { ...edit, deleted: 1 })
    toast('已刪除')
    setEdit(null)
  }

  return (
    <>
      <TopBar title="客戶" sub={`${customers.filter((c) => c.active).length} 位`}
        right={<button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={openNew}>＋ 新增</button>} />
      <main className="page">
        <div className="field" style={{ marginBottom: 8 }}>
          <input type="search" placeholder="搜尋姓名 / 電話 / 地址" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 && <div className="card empty">尚無客戶，按右上角新增</div>}
        {list.map((c) => {
          const mine = ordersOf(c)
          const open = mine.filter((b) => b.status !== 'shipped').length
          const doneCount = mine.length - open
          return (
            <div key={c.id} className="card" style={{ opacity: c.active ? 1 : 0.55 }}>
              <div className="row between">
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEdit({ ...c })} aria-label={`編輯 ${c.name}`}>
                  <div className="title">{c.name}{!c.active && <span className="badge gray" style={{ marginLeft: 8 }}>停用</span>}</div>
                  <div className="muted">
                    {c.deliveryMethod ? DELIVERY_LABEL[c.deliveryMethod] : '未設定交貨方式'}
                    {open > 0 && ` · 進行中 ${open} 筆訂單`}
                    {open === 0 && doneCount > 0 && ` · 已完成 ${doneCount} 筆訂單`}
                  </div>
                  {c.address && <div className="muted truncate">📍 {c.address}</div>}
                </button>
                {c.phone && <a className="btn sm" href={`tel:${c.phone}`}>📞</a>}
                <button className="btn sm" onClick={() => setEdit({ ...c })}>編輯</button>
              </div>
            </div>
          )
        })}
      </main>

      {edit && (
        <Sheet title={edit.name || '新增客戶'} onClose={() => setEdit(null)}>
          <Field label="客戶姓名 / 公司"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
          <Field label="手機號碼"><input type="tel" inputMode="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="09xx-xxx-xxx" /></Field>
          <Field label="交貨方式">
            <Chips options={DELIVERY_OPTIONS} value={edit.deliveryMethod ?? 'pickup'} onChange={(v) => setEdit({ ...edit, deliveryMethod: v })} labels={(v) => DELIVERY_LABEL[v]} />
          </Field>
          <Field label="送貨地址"><input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} placeholder="縣市 鄉鎮 路名…" /></Field>
          <Field label="備註"><textarea value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="例：習慣早上收貨、月結" /></Field>
          <Field label="狀態" hint="停用：不會出現在新增訂單的客戶選單，但資料保留">
            <button className="btn block" onClick={() => setEdit({ ...edit, active: !edit.active })}>{edit.active ? '啟用中（點擊停用）' : '已停用（點擊啟用）'}</button>
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存</button>
          </div>
          {customers.some((c) => c.id === edit.id) && (
            <button className="btn danger block" style={{ marginTop: 10 }} onClick={remove}>🗑 刪除客戶</button>
          )}
        </Sheet>
      )}
    </>
  )
}
