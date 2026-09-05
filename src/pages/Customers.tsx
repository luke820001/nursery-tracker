import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, putMaster } from '../lib/db'
import { uid } from '../lib/id'
import { DELIVERY_LABEL, DELIVERY_OPTIONS, type Customer } from '../lib/types'
import { Chips, Field, Sheet, TopBar, useToast } from '../components/ui'

export default function Customers() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Customer | null>(null)
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? []
  const batches = useLiveQuery(() => db.batches.filter((b) => !b.deleted && b.status !== 'cancelled').toArray(), []) ?? []

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
          const open = batches.filter((b) => b.status !== 'shipped' && (b.orders ?? []).some((o) => o.customerId === c.id)).length
          return (
            <div key={c.id} className="card" style={{ opacity: c.active ? 1 : 0.55 }}>
              <div className="row between">
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEdit({ ...c })}>
                  <div className="title">{c.name}{!c.active && <span className="badge gray" style={{ marginLeft: 8 }}>停用</span>}</div>
                  <div className="muted">
                    {c.deliveryMethod ? DELIVERY_LABEL[c.deliveryMethod] : '未設定交貨方式'}
                    {open > 0 && ` · 進行中 ${open} 批`}
                  </div>
                  {c.address && <div className="muted truncate">📍 {c.address}</div>}
                </button>
                {c.phone && <a className="btn sm" href={`tel:${c.phone}`}>📞 撥打</a>}
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
