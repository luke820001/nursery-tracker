import { db, putBatch, putEvent, recalcLoss } from './db'
import { pendingOrders, shippedTrays } from './orders'
import { uid } from './id'
import { nowIso } from './dates'
import type { Batch, BatchEvent, BatchStatus, EventType } from './types'

export type Milestone = 'soak' | 'sow' | 'harden' | 'ship'

export const MILESTONE_LABEL: Record<Milestone, string> = {
  soak: '浸種/催芽', sow: '播種', harden: '開始健化', ship: '出貨',
}

const NEXT_STATUS: Record<Milestone, BatchStatus> = {
  soak: 'soaking', sow: 'growing', harden: 'hardening', ship: 'shipped',
}

export async function addEvent(batchId: string, type: EventType, date: string, qty?: number, note?: string) {
  const e: BatchEvent = { id: uid(), batchId, type, date, qty, note, createdAt: nowIso(), updatedAt: nowIso() }
  await putEvent(e)
  if (type === 'loss') await recalcLoss(batchId)
  return e
}

/** 完成里程碑：更新實際日期 + 狀態 + 寫入事件 */
export async function completeMilestone(b: Batch, m: Milestone, date: string, qty?: number, note?: string) {
  const fresh = (await db.batches.get(b.id)) ?? b
  if (m === 'soak') fresh.actualSoakDate = date
  if (m === 'sow') fresh.actualSowDate = date
  if (m === 'harden') fresh.actualHardenDate = date
  if (m === 'ship') {
    fresh.actualShipDate = date
    fresh.shippedTrays = qty ?? Math.max(0, fresh.trayCount - fresh.lossTrays)
  }
  fresh.status = NEXT_STATUS[m]
  await putBatch(fresh)
  await addEvent(fresh.id, m, date, qty, note)
  return fresh
}

/** 出貨給某個交貨對象（可分多次）；全部出完自動改為已出貨 */
export async function shipOrder(b: Batch, orderId: string, trays: number, date: string) {
  const fresh = (await db.batches.get(b.id)) ?? b
  const o = fresh.orders.find((x) => x.id === orderId)
  if (!o) return fresh
  o.shippedTrays += trays
  o.shippedDate = date
  fresh.shippedTrays = shippedTrays(fresh)
  fresh.actualShipDate = date
  if (pendingOrders(fresh).length === 0) fresh.status = 'shipped'
  else if (fresh.status !== 'ready') fresh.status = 'ready'
  await putBatch(fresh)
  const e: BatchEvent = { id: uid(), batchId: fresh.id, type: 'ship', date, qty: trays, orderId: o.id, customerName: o.customerName, createdAt: nowIso(), updatedAt: nowIso() }
  await putEvent(e)
  return fresh
}

/** 沒有交貨對象、或剩餘不出了：直接結案為已出貨 */
export async function finishShipping(b: Batch, date: string, trays?: number) {
  const fresh = (await db.batches.get(b.id)) ?? b
  fresh.status = 'shipped'
  fresh.actualShipDate = date
  fresh.shippedTrays = trays !== undefined ? trays : shippedTrays(fresh)
  await putBatch(fresh)
  if (trays !== undefined) await addEvent(fresh.id, 'ship', date, trays)
  return fresh
}

export async function setStatus(b: Batch, status: BatchStatus) {
  const fresh = (await db.batches.get(b.id)) ?? b
  fresh.status = status
  await putBatch(fresh)
}
