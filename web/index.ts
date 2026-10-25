/** 即刻 Jot — app 插件入口。setup(uiCtx) 由宿主 pluginHost 调用。 */
import { setUi, type UiLike } from './host'
import { initNav } from './lib/nav'
import { initStore, stopStore } from './state/store'
import { startSyncLoop, stopSyncLoop } from './lib/sync'
import { releaseMic } from './lib/audio'
import { injectUiCss, removeUiCss } from './lib/ui.css'
import App from './App.vue'
import { stopNoteEvents } from './lib/noteEvents'

export async function setup(uiCtx: UiLike) {
  setUi(uiCtx)
  injectUiCss() // 插件自带语义样式（不依赖宿主 Tailwind 构建是否包含新类）
  uiCtx.registerApp({
    id: 'anka-jot',
    title: '即刻',
    icon: 'zap',
    route: '/anka-jot',
    component: App,
    order: 10,
    sidebar: true,
  })
  const stopNav = initNav(uiCtx.navigation)
  await initStore()
  startSyncLoop()
  return {
    teardown() {
      stopNav()
      stopSyncLoop()
      stopStore()
      stopNoteEvents()
      releaseMic() // 释放会话级麦克风流与共享 AudioContext
      removeUiCss()
      uiCtx.unregisterApp('anka-jot')
    },
  }
}
