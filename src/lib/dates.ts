import dayjs from 'dayjs'

export const fmt = (d: dayjs.Dayjs | Date | string) => dayjs(d).format('YYYY-MM-DD')
export const today = () => fmt(new Date())
export const addDays = (d: string, n: number) => fmt(dayjs(d).add(n, 'day'))
export const diffDays = (a: string, b: string) => dayjs(a).diff(dayjs(b), 'day')
export const nowIso = () => new Date().toISOString()
export const shortDate = (d?: string) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')

// ---- 農曆（使用瀏覽器內建 Intl 中國曆，免套件；支援閏月）----
const DAY_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
let lunarFmt: Intl.DateTimeFormat | null | undefined
const lunarCache = new Map<string, string>()
export function lunar(d: string): string {
  const hit = lunarCache.get(d)
  if (hit !== undefined) return hit
  let out = ''
  try {
    if (lunarFmt === undefined) {
      try { lunarFmt = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'long', day: 'numeric' }) } catch { lunarFmt = null }
    }
    if (lunarFmt) {
      const parts = lunarFmt.formatToParts(new Date(d + 'T12:00:00'))
      const m = parts.find((p) => p.type === 'month')?.value ?? ''
      const day = Number(parts.find((p) => p.type === 'day')?.value)
      out = m + (DAY_CN[day - 1] ?? day)
    }
  } catch { out = '' }
  lunarCache.set(d, out)
  return out
}
/** 2026-09-07（農曆七月廿六） */
export const fullDate = (d?: string) => {
  if (!d) return '—'
  const l = lunar(d)
  return l ? `${d}（農曆${l}）` : d
}
export const weekday = (d: string) => '日一二三四五六'[dayjs(d).day()]
/** ISO 時間 → 本地 HH:mm */
export const localTime = (iso?: string) => (iso ? dayjs(iso).format('HH:mm') : '')
/** ISO 時間 → 本地 YYYY-MM-DD HH:mm */
export const localDateTime = (iso?: string) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '')
