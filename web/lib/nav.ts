/** 插件内部栈由 Jot 保存；系统返回统一由 Anka 分发，URL 只镜像当前视图。 */
import { reactive } from 'vue'
import type { UiLike } from '../host'

export interface NavItem { view: string; params: Record<string, string> }

/** 顶部三个标签为栈根；settings（我的）由「即刻」徽标压栈进入，故不是根。 */
const TAB_ROOTS = new Set(['home', 'calendar', 'discover'])

export const nav = reactive({
  stack: [{ view: 'home', params: {} }] as NavItem[],
  get current(): NavItem { return this.stack[this.stack.length - 1] },
  get depth(): number { return this.stack.length },
})

function toHash(it: NavItem): string {
  const p = Object.entries(it.params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `#/${it.view}${p ? '?' + p : ''}`
}
function fromHash(h: string): NavItem | null {
  const m = /^#\/(\w+)(?:\?(.*))?$/.exec(h || '')
  if (!m) return null
  const params: Record<string, string> = {}
  for (const kv of (m[2] || '').split('&')) {
    if (!kv) continue
    const [k, v] = kv.split('='); params[k] = decodeURIComponent(v ?? '')
  }
  return { view: m[1], params }
}

let hostNavigation: UiLike['navigation']
function writeUrl() {
  if (hostNavigation) {
    void hostNavigation.setHash('anka-jot', toHash(nav.current))
      .catch(e => console.error('[jot] navigation', e))
  } else if (location.pathname === '/anka-jot') {
    // 旧宿主兼容：保留 Vue Router 的 history.state，且不改其他应用 URL。
    history.replaceState(history.state, '', location.pathname + location.search + toHash(nav.current))
  }
}

export function push(view: string, params: Record<string, string> = {}) {
  nav.stack.push({ view, params }); writeUrl()
}
export function replace(view: string, params: Record<string, string> = {}) {
  nav.stack.splice(nav.stack.length - 1, 1, { view, params }); writeUrl()
}
export function goTab(view: string) {
  nav.stack.splice(0, nav.stack.length, { view, params: {} }); writeUrl()
}
export function pop(fallback = 'home') {
  if (nav.stack.length > 1) nav.stack.pop()
  else nav.stack[0] = { view: fallback, params: {} }
  writeUrl()
}
export function isTab(view: string) { return TAB_ROOTS.has(view) }

export function initNav(navigation?: UiLike['navigation']) {
  hostNavigation = navigation
  // 只解析自己的深链；其他插件的 hash 不属于 Jot。
  const it = location.pathname === '/anka-jot' ? fromHash(location.hash) : null
  if (it) {
    const stack = isTab(it.view) ? [it] : [{ view: 'home', params: {} }, it]
    nav.stack.splice(0, nav.stack.length, ...stack)
  }
  const unregister = navigation?.register({
    appId: 'anka-jot',
    canGoBack: () => nav.depth > 1,
    back: () => pop(),
  })
  return () => { unregister?.(); hostNavigation = undefined }
}
