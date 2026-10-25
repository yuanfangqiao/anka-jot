/** Real Jot UI, independent client storage, temporary server; no personal data. */
import { createApp, defineComponent, h, ref } from 'vue'
import App from '../web/App.vue'
import { setUi } from '../web/host'
import { initStore } from '../web/state/store'
import { initNav } from '../web/lib/nav'
import { startSyncLoop } from '../web/lib/sync'
import { injectUiCss } from '../web/lib/ui.css'
import { runStorageChecks } from './storage-checks'
import '../../../web/src/styles/tokens.css'
import '../../../web/src/styles/base.css'
import '../../../.plugin-dist/anka-jot/index.css'
const message = ref('隔离回归环境')
const Icon = defineComponent({ setup: () => () => h('span', { 'aria-hidden': 'true' }, '◉') })
const navigation = {
  register: () => () => {},
  async setHash(_id: string, hash: string) { history.replaceState(history.state, '', '/anka-jot' + hash) },
}
setUi({ icons: new Proxy({}, { get: () => Icon }), navigation,
  api: { async callApp(_id, method, args = {}) {
    const r = await fetch('/__fixture_api', { method: 'POST', body: JSON.stringify({ method, args }) })
    const result = await r.json()
    if (!r.ok) throw new Error(result.error)
    return result
  } }, toast: { ok(text) { message.value = text }, err(text) { message.value = text } },
  layout: { isMobile: { value: true }, isWide: { value: false } },
  vue: {}, components: {}, registerApp() {}, unregisterApp() {},
})
injectUiCss()
initNav(navigation)
await initStore()
startSyncLoop()
createApp({ setup: () => () => h('div', { style: 'height:100dvh;display:flex;flex-direction:column' }, [
  h('div', { style: 'padding:6px;font-size:12px;flex-shrink:0;background:var(--bg-1)' }, [
    h('span', { role: 'status' }, message.value),
    h('button', { style: 'margin-left:12px', onClick: async () => {
      try { message.value = await runStorageChecks() }
      catch (e: any) { message.value = 'FAIL: ' + e.message }
    } }, '运行存储回归'),
  ]), h('div', { style: 'flex:1;min-height:0;position:relative' }, [h(App)]),
]) }).mount('#app')
