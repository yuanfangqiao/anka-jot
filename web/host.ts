/**
 * host.ts — 宿主注入的 uiCtx 持有处 + 全局类型 + /call 封装。
 * 插件模块共享同一份模块图，setup() 时写入，组件经 useUi() 取用。
 */

export interface UiLike {
  vue: any
  components: Record<string, any>
  icons: Record<string, any>
  api: { callApp: (id: string, method: string, args?: Record<string, unknown>, options?: { signal?: AbortSignal }) =>
    Promise<{ ok: boolean; result: any }> }
  toast: { ok: (m: string) => void; err?: (m: string) => void; info?: (m: string) => void }
  layout: { isMobile: { value: boolean }; isWide: { value: boolean } }
  navigation?: {
    register: (handler: { appId: string; canGoBack: () => boolean;
      back: () => void | Promise<void>; priority?: number }) => () => void
    setHash: (appId: string, hash: string) => Promise<void>
  }
  registerApp: (meta: any) => void
  unregisterApp: (id: string) => void
}

let ui: UiLike | null = null
export function setUi(ctx: UiLike) { ui = ctx }
export function useUi(): UiLike {
  if (!ui) throw new Error('jot: uiCtx 未初始化')
  return ui
}
/** toast 容错封装（宿主 toast 方法名不确定时静默） */
export function toast(msg: string, ok = true) {
  const t = ui?.toast as any
  if (!t) return
  ;(ok ? (t.ok ?? t.success ?? t.show) : (t.err ?? t.error ?? t.show))?.call(t, msg)
}

export interface Seg { t0: number; t1: number; text: string; edited?: boolean }
export interface JotAtt {
  id: string; noteId: string; kind: 'image' | 'audio' | 'video'
  serverPath?: string | null; thumbPath?: string | null
  width?: number; height?: number; duration?: number; size?: number
  peaks?: number[] | null; ocrText?: string | null
  transcript?: Seg[] | null; sha256?: string; createdAt: number
  pendingOcr?: boolean
}
/** 事项：独立于正文与待办标志存储，任何卡片类型都可拥有 */
export interface JotTodo {
  /** 稳定 key（随机串），勾选/删除时列表不错位 */
  id: string
  text: string
  done: boolean
}
export interface JotNote {
  id: string; title: string; text: string; tags: string[]
  source: 'text' | 'camera' | 'album' | 'voice' | 'share'
  createdAt: number; updatedAt: number; pinned: boolean
  /** 收藏（与置顶独立：置顶影响排序，收藏只做标记与筛选） */
  fav?: boolean
  /** 待办标志：只决定卡型（待办卡）与待办页收录，与事项列表无关 */
  todo?: boolean
  /** 事项列表：独立存储，关掉待办标志也不删除 */
  todos?: JotTodo[]
  color: string | null; location: { lat: number; lng: number; name?: string } | null
  deleted: boolean; rev: number
  syncState?: 'local' | 'syncing' | 'synced'
  atts?: JotAtt[]
}
export interface JotTag { name: string; color: string | null; pinned: boolean; lastUsedAt: number }

/** 日志只打方法名与参数规模，避免 base64 分块等大 payload 拖垮 console */
function _argDigest(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(args ?? {})) {
    if (typeof v === 'string' && v.length > 256) parts.push(`${k}:<str ${v.length}>`)
    else parts.push(`${k}:${typeof v === 'object' && v !== null ? '[obj]' : String(v)}`)
  }
  return parts.join(' ')
}

export async function callJot<T = any>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  // 只约束同步请求；AI/OCR 等长任务保持原行为。
  const bounded = /^(snapshot|stats|ensure_thumbnail|upload_.*|upsert_note|delete_note|upsert_tag|calendar_counts|notes_by_day|get_note)$/.test(method)
  const controller = new AbortController()
  const timer = bounded ? setTimeout(() => controller.abort(), 60_000) : null
  try {
    const r = await useUi().api.callApp('anka-jot', method, args, { signal: controller.signal })
    return r?.result as T
  } catch (e) {
    console.error('[jot] call ✗', method, _argDigest(args), e)
    throw e
  } finally { if (timer !== null) clearTimeout(timer) }
}

export const MEDIA_BASE = '/plugins/anka-jot/'
export function mediaUrl(p?: string | null): string | null {
  return p ? MEDIA_BASE + p : null
}

export const TAG_COLORS = ['#5E9B74', '#D9A441', '#6B8FC4', '#8B7BD8', '#C46B6B', '#5FA8A0']
