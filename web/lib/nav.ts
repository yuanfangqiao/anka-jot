/** nav.ts — 插件内栈式导航。registerApp 只给一条 /jot 路由，
 *  内部视图自管；栈序列化进 location.hash（#/note/<id>），刷新可恢复、
 *  系统返回键经 popstate 回退。 */
import { reactive } from 'vue'

export interface NavItem { view: string; params: Record<string, string> }

const TAB_ROOTS = new Set(['home', 'calendar', 'discover', 'settings'])

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

let silent = false
function writeUrl() {
  silent = true
  history.replaceState(null, '', location.pathname + location.search + toHash(nav.current))
  queueMicrotask(() => { silent = false })
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

export function initNav() {
  const it = fromHash(location.hash)
  if (it) nav.stack.splice(0, nav.stack.length, it)
  window.addEventListener('popstate', () => {
    if (silent) return
    const cur = fromHash(location.hash)
    if (!cur) { pop(); return }
    // 与当前栈顶不同步时以 URL 为准（浏览器前进/后退）
    const top = nav.current
    if (cur.view !== top.view || JSON.stringify(cur.params) !== JSON.stringify(top.params)) {
      if (nav.stack.length > 1) nav.stack.pop()
      else nav.stack[0] = cur
    }
  })
}
