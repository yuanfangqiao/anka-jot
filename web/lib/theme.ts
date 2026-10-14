/** theme.ts — 插件调色板跟随宿主主题。
 *  宿主 data-theme='light'（或缺省非 dark）：向 .jot-root 注入奶油浅色板；
 *  宿主 data-theme='dark'：移除覆盖，跟随宿主深色 token（与「黑夜模式」皮肤统一）。
 *  MutationObserver 监听 <html data-theme>，切换即时生效；teardown 断开。 */

const LIGHT_PALETTE: Record<string, string> = {
  '--bg-0': '#f6f2e9',
  '--bg-1': '#ffffff',
  '--bg-2': '#efe9dc',
  '--text-0': '#2b2925',
  '--text-1': '#6a665c',
  '--text-2': '#a39e90',
  '--primary': '#2f3b57',
  '--primary-2': '#58678c',
  '--cyan': '#7b6cf0',
  '--ok': '#3d9e6b',
  '--warn': '#d99a2b',
  '--err': '#d94f4f',
  '--line': 'rgb(60 54 44 / 0.08)',
  '--glass': 'rgb(60 54 44 / 0.045)',
}

let observer: MutationObserver | null = null
let rootEl: HTMLElement | null = null

function isHostDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function apply(): void {
  if (!rootEl) return
  const dark = isHostDark()
  for (const [k, v] of Object.entries(LIGHT_PALETTE)) {
    // dark：清空内联覆盖（跟随宿主）；light：注入奶油色板
    rootEl.style.setProperty(k, dark ? '' : v)
  }
  rootEl.style.colorScheme = dark ? '' : 'light'
}

/** 开始跟随宿主主题（root 为 .jot-root 元素；幂等） */
export function startThemeFollow(root: HTMLElement): void {
  rootEl = root
  apply()
  observer?.disconnect()
  observer = new MutationObserver(apply)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

export function stopThemeFollow(): void {
  observer?.disconnect()
  observer = null
  rootEl = null
}
