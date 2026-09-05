import type { Batch, BatchOrder, Customer } from './types'
import { DELIVERY_LABEL } from './types'

/** 已分配給交貨對象的盤數 */
export const allocatedTrays = (b: Batch) => (b.orders ?? []).reduce((s, o) => s + o.trays, 0)

/** 已出貨盤數 */
export const shippedTrays = (b: Batch) => (b.orders ?? []).reduce((s, o) => s + o.shippedTrays, 0)

/** 尚未出貨完成的交貨對象 */
export const pendingOrders = (b: Batch) => (b.orders ?? []).filter((o) => o.shippedTrays < o.trays)

/** 金額：已出貨用實際盤數，否則用預定盤數 */
export const orderAmount = (o: BatchOrder) => (o.unitPrice ? (o.shippedTrays || o.trays) * o.unitPrice : 0)
export const batchAmount = (b: Batch) => (b.orders ?? []).reduce((s, o) => s + orderAmount(o), 0)

/** 供列表 / 搜尋 / CSV 用的客戶摘要：王大明 10、李小華 5 */
export function customerSummary(b: Batch) {
  const os = b.orders ?? []
  if (!os.length) return ''
  return os.map((o) => (os.length > 1 ? `${o.customerName} ${o.trays}` : o.customerName)).join('、')
}

export function orderLine(o: BatchOrder) {
  return `${o.customerName} ${o.trays} 盤 · ${DELIVERY_LABEL[o.deliveryMethod]}${o.unitPrice ? ` · ${o.unitPrice} 元/盤` : ''}`
}

export function newOrder(c: Customer | undefined, name: string, trays: number, deliveryMethod: BatchOrder['deliveryMethod'], unitPrice?: number): BatchOrder {
  return {
    id: 'o-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    customerId: c?.id, customerName: c?.name ?? name, trays, deliveryMethod,
    unitPrice: unitPrice || undefined, shippedTrays: 0,
  }
}
