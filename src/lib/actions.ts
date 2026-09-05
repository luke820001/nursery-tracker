import { db, putBatch, putEvent, recalcLoss } from './db'
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

export async function setStatus(b: Batch, status: BatchStatus) {
  const fresh = (await db.batches.get(b.id)) ?? b
  fresh.status = status
  await putBatch(fresh)
}
