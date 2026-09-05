import Dexie, { type Table } from 'dexie'
import type { AppSettings, Batch, BatchEvent, Crop, Customer, Location } from './types'
import { uid } from './id'
import { nowIso } from './dates'

/** 同步佇列：離線時所有寫入都記一筆，連線後推送 */
export interface SyncOp {
  id?: number
  table: 'batches' | 'events' | 'crops' | 'customers' | 'locations'
  rowId: string
  op: 'upsert' | 'delete'
  at: string
}

class NurseryDB extends Dexie {
  batches!: Table<Batch, string>
  events!: Table<BatchEvent, string>
  crops!: Table<Crop, string>
  customers!: Table<Customer, string>
  locations!: Table<Location, string>
  settings!: Table<AppSettings, string>
  syncQueue!: Table<SyncOp, number>

  constructor() {
    super('nursery-tracker')
    this.version(1).stores({
      batches: 'id, status, sowDate, targetShipDate, customerName, cropName, updatedAt',
      events: 'id, batchId, date, type, updatedAt',
      crops: 'id, name',
      customers: 'id, name',
      locations: 'id, name',
      settings: 'id',
      syncQueue: '++id, table, rowId',
    })
    // v2：批次改為多個交貨對象 orders[]，舊資料的單一客戶轉成一筆 order
    this.version(2).stores({}).upgrade((tx) =>
      tx.table('batches').toCollection().modify((b: any) => {
        if (!b.orders) {
          b.orders = b.customerName
            ? [{ id: 'o-' + b.id, customerId: b.customerId, customerName: b.customerName, trays: b.trayCount,
                deliveryMethod: b.deliveryMethod ?? 'pickup', unitPrice: b.unitPrice, shippedTrays: b.shippedTrays ?? 0, shippedDate: b.actualShipDate }]
            : []
        }
        delete b.customerId; delete b.deliveryMethod; delete b.unitPrice
      }),
    )
  }
}

export const db = new NurseryDB()

// ---------- 預設主檔（第一次啟動時寫入） ----------
export const DEFAULT_CROPS: Omit<Crop, 'id' | 'sortOrder'>[] = [
  { name: '高麗菜', seedlingDays: 28, soakDays: 0, hardenDays: 5, expectedLossRate: 0.05, defaultTrayCells: 128, varieties: ['初秋', '228', '雪翠'], active: true },
  { name: '花椰菜', seedlingDays: 28, soakDays: 0, hardenDays: 5, expectedLossRate: 0.05, defaultTrayCells: 128, varieties: ['慶農65', '雪山'], active: true },
  { name: '青花菜', seedlingDays: 28, soakDays: 0, hardenDays: 5, expectedLossRate: 0.05, defaultTrayCells: 128, varieties: ['綠帝', '晚生'], active: true },
  { name: '結球白菜', seedlingDays: 21, soakDays: 0, hardenDays: 4, expectedLossRate: 0.05, defaultTrayCells: 128, varieties: ['山東', '包心'], active: true },
  { name: '番茄', seedlingDays: 30, soakDays: 2, hardenDays: 5, expectedLossRate: 0.08, defaultTrayCells: 72, varieties: ['牛番茄', '小番茄', '黑柿'], active: true },
  { name: '甜椒', seedlingDays: 45, soakDays: 3, hardenDays: 7, expectedLossRate: 0.10, defaultTrayCells: 72, varieties: [], active: true },
  { name: '小黃瓜', seedlingDays: 12, soakDays: 1, hardenDays: 2, expectedLossRate: 0.05, defaultTrayCells: 72, varieties: [], active: true },
  { name: '西瓜', seedlingDays: 14, soakDays: 2, hardenDays: 3, expectedLossRate: 0.08, defaultTrayCells: 72, varieties: [], active: true },
  { name: '美生菜（結球萵苣）', seedlingDays: 22, soakDays: 1, hardenDays: 3, expectedLossRate: 0.08, defaultTrayCells: 128, varieties: ['翠容', '三元'], active: true },
  { name: '萵苣（葉萵苣）', seedlingDays: 21, soakDays: 0, hardenDays: 3, expectedLossRate: 0.05, defaultTrayCells: 200, varieties: ['福山', '大陸妹'], active: true },
]

export const byOrder = (a: Crop, b: Crop) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name, 'zh-Hant')

export async function ensureSeed() {
  // 放在同一個交易內，避免 React StrictMode / 多分頁同時初始化造成重複寫入
  await db.transaction('rw', [db.crops, db.locations, db.settings], async () => {
    if ((await db.crops.count()) === 0) {
      await db.crops.bulkAdd(DEFAULT_CROPS.map((c, i) => ({ ...c, id: uid(), sortOrder: i + 1 })))
    }
    if ((await db.locations.count()) === 0) {
      await db.locations.bulkAdd(
        ['溫室A-1床', '溫室A-2床', '溫室B-1床', '露天苗床'].map((name) => ({ id: uid(), name, active: true })),
      )
    }
    if (!(await db.settings.get('app'))) await db.settings.put({ id: 'app', farmName: '吳平種苗廠' })
  })
}

// ---------- 寫入輔助：自動蓋 updatedAt 並記入同步佇列 ----------
export async function putBatch(b: Batch) {
  b.updatedAt = nowIso()
  await db.transaction('rw', db.batches, db.syncQueue, async () => {
    await db.batches.put(b)
    await db.syncQueue.add({ table: 'batches', rowId: b.id, op: 'upsert', at: b.updatedAt })
  })
}

export async function putEvent(e: BatchEvent) {
  e.updatedAt = nowIso()
  await db.transaction('rw', db.events, db.syncQueue, async () => {
    await db.events.put(e)
    await db.syncQueue.add({ table: 'events', rowId: e.id, op: 'upsert', at: e.updatedAt })
  })
}

/** 主檔（作物/客戶/床位）寫入：蓋 updatedAt + 記入同步佇列 */
export async function putMaster<T extends Crop | Customer | Location>(table: 'crops' | 'customers' | 'locations', row: T) {
  row.updatedAt = nowIso()
  await db.transaction('rw', db[table], db.syncQueue, async () => {
    await (db[table] as Table<T, string>).put(row)
    await db.syncQueue.add({ table, rowId: row.id, op: 'upsert', at: row.updatedAt! })
  })
}

export async function softDeleteBatch(id: string) {
  const b = await db.batches.get(id)
  if (!b) return
  b.deleted = 1
  await putBatch(b)
}

export async function softDeleteEvent(id: string) {
  const e = await db.events.get(id)
  if (!e) return
  e.deleted = 1
  await putEvent(e)
  await recalcLoss(e.batchId)
}

/** 重新加總批次損耗盤數 */
export async function recalcLoss(batchId: string) {
  const evs = await db.events.where('batchId').equals(batchId).toArray()
  const loss = evs.filter((e) => e.type === 'loss' && !e.deleted).reduce((s, e) => s + (e.qty ?? 0), 0)
  const b = await db.batches.get(batchId)
  if (b && b.lossTrays !== loss) {
    b.lossTrays = loss
    await putBatch(b)
  }
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? { id: 'app', farmName: '' }
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const cur = await getSettings()
  await db.settings.put({ ...cur, ...patch, id: 'app' })
}

/** 完整備份 / 還原（JSON） */
export async function exportAll() {
  const [batches, events, crops, customers, locations, settings] = await Promise.all([
    db.batches.toArray(), db.events.toArray(), db.crops.toArray(),
    db.customers.toArray(), db.locations.toArray(), db.settings.toArray(),
  ])
  return { version: 1, exportedAt: nowIso(), batches, events, crops, customers, locations, settings }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  await db.transaction('rw', [db.batches, db.events, db.crops, db.customers, db.locations, db.settings], async () => {
    if (data.batches) await db.batches.bulkPut(data.batches)
    if (data.events) await db.events.bulkPut(data.events)
    if (data.crops) await db.crops.bulkPut(data.crops)
    if (data.customers) await db.customers.bulkPut(data.customers)
    if (data.locations) await db.locations.bulkPut(data.locations)
    if (data.settings) await db.settings.bulkPut(data.settings)
  })
}
