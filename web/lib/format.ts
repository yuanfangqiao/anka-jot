/** format.ts — 时间/时长/字节展示工具 */

export function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 相对日标签：今天 / 昨天 / 周三 / 10月3日 */
export function dayLabel(ms: number): string {
  const d = new Date(ms); const now = new Date()
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const now0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((now0 - day0) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return '周' + '日一二三四五六'[d.getDay()]
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 分组头用的完整日标签：今天 / 昨天 / 星期X / 10月3日 星期五 / 2025年12月31日 星期三 */
export function dayLabelFull(ms: number): string {
  const d = new Date(ms); const now = new Date()
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const now0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((now0 - day0) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const wd = '星期' + '日一二三四五六'[d.getDay()]
  if (diff < 7) return wd
  const date = d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  return `${date} ${wd}`
}

export function fmtDur(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fmtBytes(n?: number | null): string {
  if (!n) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a); const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

export function isoWeekKey(ms: number): string {
  const d = new Date(ms)
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const monday = day0 - ((d.getDay() + 6) % 7) * 86400000
  const m = new Date(monday)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`
}
