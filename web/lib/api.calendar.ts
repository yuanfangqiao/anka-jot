/** api.calendar.ts — 日历的远端数据源（读走服务端，写仍走本地 outbox）。
 *
 *  时区不做任何服务端推断：客户端逐日构造「本地零点」毫秒边界，
 *  服务端只做数值区间运算，夏令时 23/25 小时的天也不会错格。
 *  月计数按 MAX(rev) 做 ETag，命中时服务端只回版本号、不重传整月数组。
 */
import { callJot, type JotAtt, type JotNote } from '../host'
import * as db from './db'
import { adoptRemoteNote } from '../state/store'

/** 服务端卡片投影：text 被裁剪成 preview，全文只在详情页按 id 取。 */
export interface CalendarCard {
  id: string
  title: string
  preview: string
  textLen: number
  tags: string[]
  source: JotNote['source']
  createdAt: number
  updatedAt: number
  pinned: boolean
  fav?: boolean
  todo?: boolean
  todos?: JotNote['todos']
  color: string | null
  location: JotNote['location']
  rev: number
  atts?: JotAtt[]
}

export interface MonthData { days: number[]; rev: number; at: number }

/** 首屏与续页条数：一天最多十几条，20 足够一屏 */
export const PAGE = 20

/** 该月 N+1 个本地零点毫秒（N 为天数），严格递增；逐日构造天然处理夏令时。 */
export function monthBounds(year: number, month: number): number[] {
  const count = new Date(year, month + 1, 0).getDate()
  const out: number[] = []
  for (let d = 1; d <= count + 1; d++) out.push(new Date(year, month, d).getTime())
  return out
}

/** 某毫秒所在本地日的 [零点, 次日零点)。 */
export function dayBounds(ms: number): [number, number] {
  const d = new Date(ms)
  return [
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(),
  ]
}

/** 时区变化（旅行/改系统时区）后本地零点整体平移，缓存必须跟着失效。 */
export function tzFingerprint(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  return `${zone}@${new Date().getTimezoneOffset()}`
}

const CACHE_MAX = 12
const cache = new Map<string, MonthData>()

function keyOf(year: number, month: number): string {
  return `${year}-${month}-${tzFingerprint()}`
}

function remember(key: string, data: MonthData) {
  cache.delete(key)
  cache.set(key, data)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** 会话内缓存（切回已看过的月份立即出点，同时用 rev 静默校验）。 */
export function peekMonth(year: number, month: number): MonthData | null {
  return cache.get(keyOf(year, month)) ?? null
}

export function invalidateMonth(ms: number) {
  const d = new Date(ms)
  cache.delete(keyOf(d.getFullYear(), d.getMonth()))
}

/** 整月计数：命中 rev 时服务端只回版本号，这里直接复用缓存。 */
export async function loadMonth(year: number, month: number): Promise<MonthData> {
  const key = keyOf(year, month)
  const cached = cache.get(key) ?? null
  const r = await callJot<{ days: number[]; rev: number; unchanged: boolean }>(
    'calendar_counts',
    { dayStarts: monthBounds(year, month), knownRev: cached?.rev ?? 0 },
  )
  if (r?.unchanged && cached) return cached
  const data: MonthData = { days: r?.days ?? [], rev: r?.rev ?? 0, at: Date.now() }
  remember(key, data)
  return data
}

/** 按天 keyset 分页；cursor 为服务端下发的不透明串，客户端不解析。 */
export async function loadDay(
  startMs: number, endMs: number, cursor: string | null, limit = PAGE,
): Promise<{ cards: CalendarCard[]; nextCursor: string | null; hasMore: boolean }> {
  const r = await callJot<{ notes: CalendarCard[]; nextCursor: string | null; hasMore: boolean }>(
    'notes_by_day', { startMs, endMs, cursor: cursor ?? undefined, limit },
  )
  return {
    cards: r?.notes ?? [],
    nextCursor: r?.nextCursor ?? null,
    hasMore: Boolean(r?.hasMore),
  }
}

/** 卡片投影 → NoteCard 需要的笔记形状。text 只有预览，只可用于展示。 */
export function cardToNote(c: CalendarCard): JotNote {
  return {
    id: c.id, title: c.title, text: c.preview, tags: c.tags ?? [], source: c.source,
    createdAt: c.createdAt, updatedAt: c.updatedAt, pinned: c.pinned,
    fav: c.fav, todo: c.todo, todos: c.todos ?? [],
    color: c.color, location: c.location, deleted: false, rev: c.rev,
    syncState: 'synced', atts: c.atts ?? [],
  }
}

/** 并发去重：连点同一张卡只发一次 get_note */
const inflight = new Map<string, Promise<void>>()

/** 打开前保证本地有完整笔记：远端取回 → 落 IndexedDB → 进内存。
 *  列表里的 preview 永不写库，避免 600 字截断被当成正文保存。 */
export function ensureLocalNote(id: string): Promise<void> {
  const hit = inflight.get(id)
  if (hit) return hit
  const job = (async () => {
    const local = await db.getNote(id)
    if (local) { adoptRemoteNote(local); return }
    const remote = await callJot<JotNote & { atts?: JotAtt[] }>('get_note', { id })
    if (!remote?.id) throw new Error('笔记不存在')
    const atts = remote.atts ?? []
    const note: JotNote = { ...remote, syncState: 'synced' }
    delete (note as Partial<JotNote> & { atts?: unknown }).atts
    await db.saveNote(note, false)
    for (const a of atts) await db.putAtt(a)
    adoptRemoteNote({ ...note, atts })
  })().finally(() => { inflight.delete(id) })
  inflight.set(id, job)
  return job
}
