<script setup lang="ts">
/** App — Jot 根组件：视图出口（useNav 栈）+ 顶部标签导航。
 *  底部是宿主 dock 的地盘，Jot 不渲染任何悬浮按钮/底部栏（四入口在首页底部固定）。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast, useUi } from './host'
import { goTab, nav, push } from './lib/nav'
import { attachImage, attachVideo, captureLocation, flushSave, newNote } from './state/store'
import { isVideoFile, VIDEO_MAX_BYTES } from './lib/video'
import { startThemeFollow, stopThemeFollow } from './lib/theme'
import { closeCardMenu, menuNote } from './state/menu'
import { cancelConfirm, confirmReq } from './state/confirm'
import Home from './views/Home.vue'
import Detail from './views/Detail.vue'
import RecordView from './views/Record.vue'
import CameraView from './views/Camera.vue'
import Calendar from './views/Calendar.vue'
import Todo from './views/Todo.vue'
import Favs from './views/Favs.vue'
import Discover from './views/Discover.vue'
import Search from './views/Search.vue'
import Settings from './views/Settings.vue'
import { todoUndo, todoBusy, undoCardTodo } from './state/todoActions'
import CardMenu from './components/CardMenu.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { usePasteCapture } from './state/paste'

const ui = useUi()
const icons = ui.icons

/** 调色板跟随宿主主题：浅色宿主注入奶油色板，深色宿主跟随其 token（lib/theme.ts） */
const rootEl = ref<HTMLElement>()
usePasteCapture(rootEl, () => Boolean(menuNote.value || confirmReq.value) || ['camera', 'record'].includes(nav.current.view))
onMounted(() => { if (rootEl.value) startThemeFollow(rootEl.value) })
onBeforeUnmount(stopThemeFollow)

const VIEWS: Record<string, any> = {
  home: Home, note: Detail, record: RecordView, camera: CameraView,
  calendar: Calendar, todo: Todo, favs: Favs, discover: Discover, search: Search, settings: Settings,
}
const curView = computed(() => VIEWS[nav.current.view] ?? Home)
const curParams = computed(() => nav.current.params)
const fullscreen = computed(() => ['camera', 'record'].includes(nav.current.view))
const showChrome = computed(() => !fullscreen.value)

const TABS = [
  { view: 'home', icon: 'House', label: '首页' },
  { view: 'todo', icon: 'ListChecks', label: '待办' },
  { view: 'favs', icon: 'Star', label: '收藏' },
  { view: 'calendar', icon: 'CalendarDays', label: '日历' },
  { view: 'discover', icon: 'Compass', label: '发现' },
]

/** 切页/进详情时收起卡片菜单与确认弹层，避免遮罩残留 */
watch(() => nav.current.view, () => { closeCardMenu(); cancelConfirm() })

/** 「即刻」徽标即「我的」入口：压栈打开设置，系统返回回到原页 */
function openSettings() {
  if (nav.current.view === 'settings') return
  push('settings')
}

const albumInput = ref<HTMLInputElement>()
const videoInput = ref<HTMLInputElement>()

/** ＋五入口统一分发 */
function onPick(kind: 'text' | 'camera' | 'video' | 'album' | 'voice') {
  if (kind === 'text') {
    // 只传 id：位置由 Detail 在「真正会被保存的那个对象」上采集，
    // 这里另建对象再采集会落到一个没人入库的临时对象上，位置必丢。
    push('note', { id: crypto.randomUUID(), fresh: '1' })
  } else if (kind === 'camera') push('camera')
  else if (kind === 'voice') push('record')
  else if (kind === 'album') albumInput.value?.click()
  else videoInput.value?.click() // 视频：<input capture> 直呼系统相机录像（移动端免授权）
}

/** 相册导入（图片+视频混合多选）。
 *  顺序必须「先挂附件、flushSave 再持久化」：persist 有空笔记保护，
 *  若先 save 后挂附件会被判空跳过，touchNote 也查不到 → 整条笔记静默丢失（对齐 Record/Camera）。 */
async function onAlbum(files: FileList | null) {
  if (!files?.length) return
  const n = newNote('album')
  captureLocation(n)
  let added = 0
  for (const f of Array.from(files)) {
    if (f.type.startsWith('image/')) { await attachImage(n.id, f); added++ }
    else if (isVideoFile(f)) {
      if (f.size > VIDEO_MAX_BYTES) { toast('视频超过 100MB，已跳过', false); continue }
      await attachVideo(n.id, f); added++
    }
  }
  if (!added) return // 没有可导入的媒体：不建空笔记
  await flushSave(n)
  push('note', { id: n.id })
}

/** 系统相机录像回传（移动端 capture 唤起录像模式；桌面端退化为文件选择） */
async function onVideo(files: FileList | null) {
  const f = files?.[0]
  if (!f) return
  if (!isVideoFile(f)) { toast('仅支持视频文件', false); return }
  if (f.size > VIDEO_MAX_BYTES) { toast('视频超过 100MB，暂不支持', false); return }
  const n = newNote('camera')
  captureLocation(n)
  try {
    await attachVideo(n.id, f) // 附件先落库
    await flushSave(n) // 再持久化：persist 的空笔记检查此时能查到附件
    push('note', { id: n.id })
  } catch {
    toast('视频保存失败，请重试', false)
  }
}

/** 处理后重置 input value，确保同一文件再次选择仍触发 change */
function onAlbumChange(e: Event) {
  const el = e.target as HTMLInputElement
  void onAlbum(el.files)
  el.value = ''
}
function onVideoChange(e: Event) {
  const el = e.target as HTMLInputElement
  void onVideo(el.files)
  el.value = ''
}
</script>

<template>
  <div ref="rootEl" class="jot-root relative flex h-full w-full flex-col overflow-hidden bg-bg-0 text-ink-0">
    <!-- 顶部导航（取代底部 Tab，避开宿主 dock） -->
    <header v-if="showChrome" class="z-20 shrink-0 px-4 pt-3">
      <div class="jot-container flex items-center gap-3">
        <button
          type="button" title="我的" aria-label="我的"
          class="flex cursor-pointer items-center gap-1.5 jot-fs-17 font-bold tracking-tight transition-colors"
          :class="nav.current.view === 'settings' ? 'text-brand' : 'text-ink-0'"
          @click="openSettings"
        >
          <component :is="icons.NotebookPen" :size="18" class="text-brand" />即刻
        </button>
        <nav class="jot-nav flex flex-1 items-center gap-0.5 rounded-full bg-bg-1 p-1 shadow-card">
          <button
            v-for="t in TABS" :key="t.view" type="button"
            class="jot-nav-btn" :class="{ 'is-on': nav.current.view === t.view }"
            @click="goTab(t.view)"
          >
            <component :is="icons[t.icon]" :size="14" />{{ t.label }}
          </button>
        </nav>

      </div>
    </header>

    <!-- 主区 -->
    <main class="relative min-h-0 flex-1">
      <KeepAlive :include="['Home', 'Calendar', 'Todo', 'Favs']">
        <component :is="curView" :key="nav.current.view === 'note' ? curParams.id : nav.current.view" v-bind="curParams" @create="onPick" />
      </KeepAlive>
    </main>

    <div v-if="todoUndo" class="jot-undo-notice" role="status">
      <span>已{{ todoUndo.after ? '完成' : '恢复' }}事项</span>
      <button type="button" class="jot-card-undo" :disabled="todoBusy" @click="undoCardTodo">撤销</button>
      <button type="button" aria-label="关闭撤销提示" @click="todoUndo = null">×</button>
    </div>

    <!-- 卡片「⋯」快速菜单：App 级覆盖层，卡片自身 overflow 不会裁掉它 -->
    <CardMenu v-if="menuNote" />

    <!-- 二次确认（取消置顶等）：同样 App 级覆盖层，避免被卡片 overflow 裁掉 -->
    <ConfirmDialog v-if="confirmReq" />

    <input ref="albumInput" type="file" accept="image/*,video/*" multiple class="hidden" @change="onAlbumChange" />
    <!-- 移动端 capture 直呼系统相机录像模式（免网页授权，对齐拍照路线） -->
    <input ref="videoInput" type="file" accept="video/*" capture="environment" class="hidden" @change="onVideoChange" />
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
