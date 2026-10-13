/** 即刻 Jot — app 插件入口。setup(uiCtx) 由宿主 pluginHost 调用。 */
import { setUi, type UiLike } from './host'
import { initNav } from './lib/nav'
import { initStore } from './state/store'
import { startSyncLoop, stopSyncLoop } from './lib/sync'
import App from './App.vue'

export async function setup(uiCtx: UiLike) {
  setUi(uiCtx)
  initNav()
  uiCtx.registerApp({
    id: 'jot',
    title: '即刻',
    icon: 'notebook-pen',
    route: '/jot',
    component: App,
    order: 10,
    sidebar: true,
  })
  await initStore()
  startSyncLoop()
  return {
    teardown() {
      stopSyncLoop()
      uiCtx.unregisterApp('jot')
    },
  }
}
