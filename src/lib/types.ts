// ---- 核心資料模型 ----

export type BatchStatus =
  | 'planned'    // 已接單 / 排程中
  | 'soaking'    // 浸種催芽中
  | 'sown'       // 已播種（發芽室 / 苗床）
  | 'growing'    // 苗床管理中
  | 'hardening'  // 健化中
  | 'ready'      // 可出貨
  | 'shipped'    // 已出貨 / 已交苗
  | 'cancelled'  // 取消

export const STATUS_LABEL: Record<BatchStatus, string> = {
  planned: '排程中',
  soaking: '浸種催芽',
  sown: '已播種',
  growing: '苗床管理',
  hardening: '健化中',
  ready: '可出貨',
  shipped: '已出貨',
  cancelled: '取消',
}

export const STATUS_ORDER: BatchStatus[] = [
  'planned', 'soaking', 'sown', 'growing', 'hardening', 'ready', 'shipped', 'cancelled',
]

/** 作物主檔：決定排程天數的預設值 */
export interface Crop {
  id: string
  name: string               // 高麗菜、番茄、甜椒…
  seedlingDays: number       // 苗期天數（播種 → 可交苗）
  soakDays: number           // 浸種/催芽天數（0 = 不需要）
  hardenDays: number         // 出貨前健化天數
  expectedLossRate: number   // 預估損耗率 0~1
  defaultTrayCells: number   // 預設穴盤規格
  varieties: string[]        // 常用品種（下拉快速帶入）
  sortOrder: number          // 顯示順序
  active: boolean
  updatedAt?: string
}

export type DeliveryMethod = 'pickup' | 'deliver'
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = { pickup: '客戶自取', deliver: '本場送貨' }
export const DELIVERY_OPTIONS: DeliveryMethod[] = ['pickup', 'deliver']

export interface Customer {
  id: string
  name: string
  phone?: string
  deliveryMethod?: DeliveryMethod   // 預設交貨方式
  address?: string                  // 送貨地址
  note?: string
  active: boolean
  deleted?: 0 | 1
  updatedAt?: string
}

export interface Location {
  id: string
  name: string               // 例：溫室A-3床
  active: boolean
  deleted?: 0 | 1
  updatedAt?: string
}

/** 交貨對象：同一批次可分給多個客戶 */
export interface BatchOrder {
  id: string
  customerId?: string
  customerName: string
  trays: number              // 預定盤數
  deliveryMethod: DeliveryMethod
  unitPrice?: number         // 每盤單價（選填）
  shippedTrays: number       // 已出貨盤數
  shippedDate?: string       // 最後出貨日
}

export interface Batch {
  id: string                 // 批次編號 例：B250905-01
  cropId: string
  cropName: string
  variety: string
  trayCells: number          // 穴盤規格：72/128/200/288
  trayCount: number          // 穴盤總盤數
  expectedLossRate: number   // 預估損耗率
  targetPlants: number       // 預計育成株數 = cells * trays * (1 - loss)
  orders: BatchOrder[]       // 交貨對象（可多個）
  customerName: string       // 由 orders 產生的摘要，供搜尋 / 匯出
  locationId?: string
  locationName: string
  orderDate: string          // 接單日 YYYY-MM-DD
  // 排程（預計）
  soakDate?: string          // 預計浸種/催芽日
  sowDate: string            // 預計播種日
  hardenDate: string         // 預計健化開始日
  readyDate: string          // 預計可出貨日
  targetShipDate: string     // 目標交苗日
  // 實際
  actualSoakDate?: string
  actualSowDate?: string
  actualHardenDate?: string
  actualShipDate?: string
  shippedTrays?: number      // 實際出貨盤數（= 各交貨對象已出貨加總）
  lossTrays: number          // 累計損耗盤數（由事件加總）
  status: BatchStatus
  note?: string
  createdAt: string          // ISO
  updatedAt: string          // ISO
  deleted?: 0 | 1
}

export type EventType =
  | 'soak' | 'sow' | 'move' | 'harden' | 'ship'
  | 'water' | 'fertilize' | 'pest' | 'inspect' | 'loss' | 'note'

export const EVENT_LABEL: Record<EventType, string> = {
  soak: '浸種/催芽',
  sow: '播種',
  move: '移穴/移床',
  harden: '健化',
  ship: '出貨',
  water: '澆水',
  fertilize: '施肥',
  pest: '病蟲害',
  inspect: '巡視',
  loss: '損耗',
  note: '備註',
}

export interface BatchEvent {
  id: string
  batchId: string
  type: EventType
  date: string               // YYYY-MM-DD
  qty?: number               // 損耗盤數 / 出貨盤數 / 移床盤數
  orderId?: string           // 出貨事件：對應的交貨對象
  customerName?: string      // 出貨事件：客戶名稱
  note?: string
  createdAt: string
  updatedAt: string
  deleted?: 0 | 1
}

export interface AppSettings {
  id: 'app'
  farmName: string
  // Google Sheets (Apps Script Web App)
  sheetsWebhookUrl?: string
  sheetsToken?: string
  // Supabase
  supabaseUrl?: string
  supabaseAnonKey?: string
  lastSyncAt?: string
}

export const TRAY_SPECS = [50, 72, 105, 128, 200, 288]
