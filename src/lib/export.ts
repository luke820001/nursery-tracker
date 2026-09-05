import { db } from './db'
import { DELIVERY_LABEL, EVENT_LABEL, STATUS_LABEL, type Batch, type BatchEvent } from './types'
import { actualLossRate } from './schedule'
import { batchAmount } from './orders'

function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(','))
  // UTF-8 BOM 讓 Excel 正確顯示中文
  return '﻿' + lines.join('\r\n')
}

export const BATCH_HEADERS = [
  '批次編號', '狀態', '作物', '品種', '穴盤規格', '盤數', '預計株數', '預估損耗率', '累計損耗盤數', '實際損耗率',
  '交貨對象', '金額', '床位', '接單日', '預計浸種日', '預計播種日', '預計健化日', '預計可出貨日', '目標交苗日',
  '實際播種日', '實際健化日', '實際出貨日', '出貨盤數', '備註', '更新時間',
]

export function batchRow(b: Batch): unknown[] {
  return [
    b.id, STATUS_LABEL[b.status], b.cropName, b.variety, b.trayCells, b.trayCount, b.targetPlants,
    (b.expectedLossRate * 100).toFixed(0) + '%', b.lossTrays, (actualLossRate(b) * 100).toFixed(1) + '%',
    (b.orders ?? []).map((o) => `${o.customerName} ${o.trays}盤(${DELIVERY_LABEL[o.deliveryMethod]})`).join('、'),
    batchAmount(b) || '', b.locationName, b.orderDate, b.soakDate ?? '', b.sowDate, b.hardenDate, b.readyDate, b.targetShipDate,
    b.actualSowDate ?? '', b.actualHardenDate ?? '', b.actualShipDate ?? '', b.shippedTrays ?? '', b.note ?? '', b.updatedAt,
  ]
}

export const ORDER_HEADERS = ['批次編號', '作物', '品種', '客戶', '交貨方式', '預定盤數', '已出貨盤數', '出貨日', '單價/盤', '金額', '批次狀態']

export async function buildOrderCsv() {
  const rows: unknown[][] = []
  for (const b of (await db.batches.toArray()).filter((b) => !b.deleted).sort((a, b) => b.sowDate.localeCompare(a.sowDate))) {
    for (const o of b.orders ?? []) {
      rows.push([b.id, b.cropName, b.variety, o.customerName, DELIVERY_LABEL[o.deliveryMethod], o.trays, o.shippedTrays, o.shippedDate ?? '',
        o.unitPrice ?? '', o.unitPrice ? (o.shippedTrays || o.trays) * o.unitPrice : '', STATUS_LABEL[b.status]])
    }
  }
  return toCsv(ORDER_HEADERS, rows)
}

export const EVENT_HEADERS = ['事件ID', '批次編號', '日期', '類型', '數量(盤)', '客戶', '備註', '更新時間']

export function eventRow(e: BatchEvent): unknown[] {
  return [e.id, e.batchId, e.date, EVENT_LABEL[e.type], e.qty ?? '', e.customerName ?? '', e.note ?? '', e.updatedAt]
}

export async function buildBatchCsv() {
  const rows = (await db.batches.toArray()).filter((b) => !b.deleted).sort((a, b) => b.sowDate.localeCompare(a.sowDate))
  return toCsv(BATCH_HEADERS, rows.map(batchRow))
}

export async function buildEventCsv() {
  const rows = (await db.events.toArray()).filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date))
  return toCsv(EVENT_HEADERS, rows.map(eventRow))
}

/** 手機優先用 Web Share（可直接存到 Google Drive / 傳 LINE），否則下載 */
export async function shareOrDownload(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  const file = new File([blob], filename, { type: mime })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
