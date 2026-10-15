<script setup lang="ts">
/** App — Jot 根组件：视图出口（useNav 栈）+ 顶部标签导航。
 *  底部是宿主 dock 的地盘，Jot 不渲染任何悬浮按钮/底部栏（四入口在首页底部固定）。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { toast, useUi } from './host'
import { goTab, nav, push } from './lib/nav'
import { attachImage, attachVideo, captureLocation, newNote, saveDebounced } from './state/store'
import { VIDEO_MAX_BYTES } from './lib/video'
import { startThemeFollow, stopThemeFollow } from './lib/theme'
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

/** 调色板跟随宿主主题：浅色宿主注入奶油色板，深色宿主跟随其 token（lib/theme.ts） */
const rootEl = ref<HTMLElement>()
onMounted(() => { if (rootEl.value) startThemeFollow(rootEl.value) })
onBeforeUnmount(stopThemeFollow)

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
const videoInput = ref<HTMLInputElement>()

/** ＋五入口统一分发 */
function onPick(kind: 'text' | 'camera' | 'video' | 'album' | 'voice') {
  if (kind === 'text') {
    const n = newNote('text')
    captureLocation(n)
    push('note', { id: n.id, fresh: '1' })
  } else if (kind === 'camera') push('camera')
  else if (kind === 'voice') push('record')
  else if (kind === 'album') albumInput.value?.click()
  else videoInput.value?.click() // 视频：<input capture> 直呼系统相机录像（移动端免授权）
}

async function onAlbum(files: FileList | null) {
  if (!files?.length) return
  const n = newNote('album')
  captureLocation(n)
  saveDebounced(n, true)
  for (const f of Array.from(files)) {
    if (f.type.startsWith('image/')) await attachImage(n.id, f)
    else if (f.type.startsWith('video/')) {
      if (f.size > VIDEO_MAX_BYTES) { toast('视频超过 100MB，已跳过', false); continue }
      await attachVideo(n.id, f)
    }
  }
  push('note', { id: n.id })
}

/** 系统相机录像回传（移动端 capture 唤起录像模式；桌面端退化为文件选择） */
async function onVideo(files: FileList | null) {
  const f = files?.[0]
  if (!f || !f.type.startsWith('video/')) return
  if (f.size > VIDEO_MAX_BYTES) { toast('视频超过 100MB，暂不支持', false); return }
  const n = newNote('camera')
  captureLocation(n)
  saveDebounced(n, true)
  await attachVideo(n.id, f)
  push('note', { id: n.id })
}
</script>

<template>
  <div ref="rootEl" class="jot-root relative flex h-full w-full flex-col overflow-hidden bg-bg-0 text-ink-0">
    <!-- 顶部导航（取代底部 Tab，避开宿主 dock） -->
    <header v-if="showChrome" class="z-20 shrink-0 px-4 pt-3">
      <div class="jot-container flex items-center gap-3">
        <p class="flex items-center gap-1.5 jot-fs-17 font-bold tracking-tight">
          <component :is="icons.NotebookPen" :size="18" class="text-brand" />即刻
        </p>
        <nav class="jot-nav flex flex-1 items-center rounded-full bg-bg-1 p-1 shadow-card">
          <button
            v-for="t in TABS" :key="t.view" type="button"
            class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2 jot-fs-13 transition-colors"
            :class="nav.current.view === t.view ? 'bg-brand font-medium text-white' : 'text-ink-1 hover:text-ink-0'"
            @click="goTab(t.view)"
          >
            <component :is="icons[t.icon]" :size="15" />{{ t.label }}
          </button>
        </nav>

      </div>
      <div class="jot-container mt-2">
        <OfflineBanner />
      </div>
    </header>

    <!-- 主区 -->
    <main class="relative min-h-0 flex-1">
      <KeepAlive :include="['Home', 'Calendar']">
        <component :is="curView" v-bind="curParams" @create="onPick" />
      </KeepAlive>
    </main>

    <input ref="albumInput" type="file" accept="image/*,video/*" multiple class="hidden" @change="onAlbum(($event.target as HTMLInputElement).files)" />
    <!-- 移动端 capture 直呼系统相机录像模式（免网页授权，对齐拍照路线） -->
    <input ref="videoInput" type="file" accept="video/*" capture="environment" class="hidden" @change="onVideo(($event.target as HTMLInputElement).files)" />
  </div>
</template>

<style>
/* 调色板已改由 lib/theme.ts 按宿主主题注入/移除（浅色奶油 / 深色跟随），此处仅保留阴影覆盖 */
/* 设计稿的柔和卡片阴影（宿主 shadow-card 偏暗） */
.jot-root .shadow-card {
  box-shadow: 0 1px 2px rgb(60 54 44 / 0.05), 0 10px 28px -14px rgb(60 54 44 / 0.18);
}
.jot-root .shadow-fab {
  box-shadow: 0 6px 20px -6px rgb(47 59 87 / 0.55), 0 2px 6px rgb(47 59 87 / 0.25);
}
</style>
