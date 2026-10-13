<script setup lang="ts">
/** App — Jot 根组件：视图出口（useNav 栈）+ 顶部标签导航。
 *  底部是宿主 dock 的地盘，Jot 不渲染任何悬浮按钮/底部栏（四入口在首页底部固定）。 */
import { computed, ref } from 'vue'
import { useUi } from './host'
import { goTab, nav, push } from './lib/nav'
import { attachImage, captureLocation, newNote, saveDebounced } from './state/store'
import Home from './views/Home.vue'
import Detail from './views/Detail.vue'
import RecordView from './views/Record.vue'
import CameraView from './views/Camera.vue'
import Calendar from './views/Calendar.vue'
import Discover from './views/Discover.vue'
import Search from './views/Search.vue'
import Settings from './views/Settings.vue'
import OfflineBanner from './components/OfflineBanner.vue'

const ui = useUi()
const icons = ui.icons

const VIEWS: Record<string, any> = {
  home: Home, note: Detail, record: RecordView, camera: CameraView,
  calendar: Calendar, discover: Discover, search: Search, settings: Settings,
}
const curView = computed(() => VIEWS[nav.current.view] ?? Home)
const curParams = computed(() => nav.current.params)
const fullscreen = computed(() => ['camera', 'record'].includes(nav.current.view))
const showChrome = computed(() => !fullscreen.value)

const TABS = [
  { view: 'home', icon: 'House', label: '首页' },
  { view: 'calendar', icon: 'CalendarDays', label: '日历' },
  { view: 'discover', icon: 'Compass', label: '发现' },
  { view: 'settings', icon: 'UserRound', label: '我的' },
]

const albumInput = ref<HTMLInputElement>()

/** ＋四入口统一分发 */
function onPick(kind: 'text' | 'camera' | 'album' | 'voice') {
  if (kind === 'text') {
    const n = newNote('text')
    captureLocation(n)
    push('note', { id: n.id, fresh: '1' })
  } else if (kind === 'camera') push('camera')
  else if (kind === 'voice') push('record')
  else albumInput.value?.click()
}

async function onAlbum(files: FileList | null) {
  if (!files?.length) return
  const n = newNote('album')
  captureLocation(n)
  saveDebounced(n, true)
  for (const f of Array.from(files)) {
    if (f.type.startsWith('image/')) await attachImage(n.id, f)
  }
  push('note', { id: n.id })
}
</script>

<template>
  <div class="jot-root relative flex h-full w-full flex-col overflow-hidden bg-bg-0 text-ink-0">
    <!-- 顶部导航（取代底部 Tab，避开宿主 dock） -->
    <header v-if="showChrome" class="z-20 shrink-0 px-4 pt-3">
      <div class="mx-auto flex w-full max-w-2xl items-center gap-3">
        <p class="flex items-center gap-1.5 text-[17px] font-bold tracking-tight">
          <component :is="icons.NotebookPen" :size="18" class="text-brand" />即刻
        </p>
        <nav class="flex flex-1 items-center rounded-full bg-bg-1 p-1 shadow-card">
          <button
            v-for="t in TABS" :key="t.view" type="button"
            class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] transition-colors"
            :class="nav.current.view === t.view ? 'bg-brand font-medium text-white' : 'text-ink-1 hover:text-ink-0'"
            @click="goTab(t.view)"
          >
            <component :is="icons[t.icon]" :size="15" />{{ t.label }}
          </button>
        </nav>

      </div>
      <div class="mx-auto mt-2 w-full max-w-2xl">
        <OfflineBanner />
      </div>
    </header>

    <!-- 主区 -->
    <main class="relative min-h-0 flex-1">
      <KeepAlive :include="['Home', 'Calendar']">
        <component :is="curView" v-bind="curParams" @create="onPick" />
      </KeepAlive>
    </main>

    <input ref="albumInput" type="file" accept="image/*" multiple class="hidden" @change="onAlbum(($event.target as HTMLInputElement).files)" />
  </div>
</template>

<style>
/* Jot 主题：按设计稿覆盖宿主 token（仅 .jot-root 作用域内生效，不影响宿主） */
.jot-root {
  /* !important：宿主深色主题会在更晚的级联里覆盖插件变量，导致手机端配色错乱 */
  --bg-0: #f6f2e9 !important;
  --bg-1: #ffffff !important;
  --bg-2: #efe9dc !important;
  --text-0: #2b2925 !important;
  --text-1: #6a665c !important;
  --text-2: #a39e90 !important;
  --primary: #2f3b57 !important;
  --primary-2: #58678c !important;
  --cyan: #7b6cf0 !important;
  --ok: #3d9e6b !important;
  --warn: #d99a2b !important;
  --err: #d94f4f !important;
  --line: rgb(60 54 44 / 0.08) !important;
  --glass: rgb(60 54 44 / 0.045) !important;
  color-scheme: light;
}
/* 设计稿的柔和卡片阴影（宿主 shadow-card 偏暗） */
.jot-root .shadow-card {
  box-shadow: 0 1px 2px rgb(60 54 44 / 0.05), 0 10px 28px -14px rgb(60 54 44 / 0.18);
}
.jot-root .shadow-fab {
  box-shadow: 0 6px 20px -6px rgb(47 59 87 / 0.55), 0 2px 6px rgb(47 59 87 / 0.25);
}
</style>
