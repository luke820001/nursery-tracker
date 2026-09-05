import { addDays, diffDays } from './dates'
import type { Batch, BatchStatus, Crop } from './types'

export interface ScheduleParams {
  seedlingDays: number
  soakDays: number
  hardenDays: number
  bufferDays?: number   // 安全緩衝：可出貨日提前於交苗日的天數
}

export interface Schedule {
  soakDate?: string
  sowDate: string
  hardenDate: string
  readyDate: string
  targetShipDate: string
}

/**
 * 倒推排程：輸入目標交苗日 → 計算播種日 / 浸種日 / 健化日
 *   readyDate  = targetShipDate - bufferDays
 *   sowDate    = readyDate - seedlingDays
 *   soakDate   = sowDate - soakDays        （soakDays > 0 才有）
 *   hardenDate = readyDate - hardenDays
 */
export function backward(targetShipDate: string, p: ScheduleParams): Schedule {
  const buffer = p.bufferDays ?? 0
  const readyDate = addDays(targetShipDate, -buffer)
  const sowDate = addDays(readyDate, -p.seedlingDays)
  return {
    soakDate: p.soakDays > 0 ? addDays(sowDate, -p.soakDays) : undefined,
    sowDate,
    hardenDate: addDays(readyDate, -p.hardenDays),
    readyDate,
    targetShipDate,
  }
}

/** 順推排程：輸入播種日 → 計算可出貨日 / 交苗日 */
export function forward(sowDate: string, p: ScheduleParams): Schedule {
  const buffer = p.bufferDays ?? 0
  const readyDate = addDays(sowDate, p.seedlingDays)
  return {
    soakDate: p.soakDays > 0 ? addDays(sowDate, -p.soakDays) : undefined,
    sowDate,
    hardenDate: addDays(readyDate, -p.hardenDays),
    readyDate,
    targetShipDate: addDays(readyDate, buffer),
  }
}

export function paramsFromCrop(c: Crop, bufferDays = 0): ScheduleParams {
  return { seedlingDays: c.seedlingDays, soakDays: c.soakDays, hardenDays: c.hardenDays, bufferDays }
}

/** 預計育成株數 */
export function targetPlants(trayCells: number, trayCount: number, lossRate: number) {
  return Math.round(trayCells * trayCount * (1 - lossRate))
}

/** 目前實際損耗率（以盤數估算） */
export function actualLossRate(b: Batch) {
  if (!b.trayCount) return 0
  return Math.min(1, b.lossTrays / b.trayCount)
}

/** 苗齡（天）：以實際播種日優先 */
export function seedlingAge(b: Batch, today: string) {
  const sow = b.actualSowDate ?? b.sowDate
  return diffDays(today, sow)
}

/** 依日期自動判斷「今天應該處於」的階段（用於提醒逾期） */
export function expectedStage(b: Batch, today: string): BatchStatus {
  if (b.status === 'shipped' || b.status === 'cancelled') return b.status
  if (today >= b.readyDate) return 'ready'
  if (today >= b.hardenDate) return 'hardening'
  if (today >= b.sowDate) return 'growing'
  if (b.soakDate && today >= b.soakDate) return 'soaking'
  return 'planned'
}

export interface TodoItem {
  batch: Batch
  action: 'soak' | 'sow' | 'harden' | 'ship'
  dueDate: string
  overdueDays: number
}

const STAGE_RANK: Record<BatchStatus, number> = {
  planned: 0, soaking: 1, sown: 2, growing: 2, hardening: 3, ready: 4, shipped: 5, cancelled: 9,
}

/** 產生待辦：尚未完成、且在 lookaheadDays 內到期（含逾期）的里程碑 */
export function buildTodos(batches: Batch[], today: string, lookaheadDays = 0): TodoItem[] {
  const out: TodoItem[] = []
  const limit = addDays(today, lookaheadDays)
  for (const b of batches) {
    if (b.status === 'shipped' || b.status === 'cancelled' || b.deleted) continue
    const rank = STAGE_RANK[b.status]
    const push = (action: TodoItem['action'], due: string | undefined, doneRank: number) => {
      if (!due || rank >= doneRank) return
      if (due <= limit) out.push({ batch: b, action, dueDate: due, overdueDays: diffDays(today, due) })
    }
    push('soak', b.soakDate, 1)
    push('sow', b.sowDate, 2)
    push('harden', b.hardenDate, 3)
    push('ship', b.targetShipDate, 5)
  }
  // 每批次只保留最早的一項未完成里程碑
  const seen = new Set<string>()
  return out
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .filter((t) => (seen.has(t.batch.id) ? false : (seen.add(t.batch.id), true)))
}

/** 產生批次編號：B + YYMMDD(播種日) + 流水號 */
export function nextBatchId(existing: string[], sowDate: string) {
  const prefix = 'B' + sowDate.slice(2).replace(/-/g, '')
  const n = existing.filter((id) => id.startsWith(prefix)).length + 1
  return `${prefix}-${String(n).padStart(2, '0')}`
}

