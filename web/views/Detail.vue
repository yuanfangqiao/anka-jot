<script setup lang="ts">
/** Detail — 屏② 笔记详情：上半文字编辑（独占高度、自身滚动），
 *  下半附件横滑缩略（图/视频/语音统一 3:4 瓷贴），转写折叠；
 *  顶栏：置顶 / 待办标志 / 收藏 / 删除；
 *  正文下方：事项清单（独立字段 note.todos）、OCR、AI 摘要 / AI 提取待办、标签。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { callJot, mediaUrl, toast, useUi, type JotAtt, type JotNote, type JotTodo, type Seg } from '../host'
import { pop, push } from '../lib/nav'
import { fmtTime } from '../lib/format'
import {
  captureLocation, ensureTag, flushSave, newNote, removeNote,
  saveDebounced, setActiveNote, tagColor, tags, toggleFav, togglePin, toggleTodoFlag, updateAtt,
} from '../state/store'
import { usePicker } from '../state/picker'
import { newTodo, normalizeNoteTodos } from '../lib/todos'
import * as db from '../lib/db'
import MediaShelf from '../components/MediaShelf.vue'
import TagChip from '../components/TagChip.vue'
import Empty from '../components/Empty.vue'

const props = defineProps<{ id: string; fresh?: string }>()
const icons = useUi().icons

/** 顶栏三键的开态：不换形状、不加圆底——保留描边，只把图标内部灌金（`--warn`）。
 *  描边同步加深到 `--text-0`，形成「深色边包金色心」的双色标志；未开仍是灰色细描边。
 *  着色必须内联到 <button>（svg 用 currentColor 继承描边色），样式表类会被后注入的
 *  `.jot-icon-btn { color }` 盖掉。 */
const FLAG_FILL = 'var(--warn, #d99a2b)'
const FLAG_EDGE = 'var(--text-0, #2b2925)'
const flagStyle = (on?: boolean) => (on ? { color: FLAG_EDGE } : undefined)
/** 填色走 style 而非 fill 属性：SVG 表现属性里的 var() 在部分内核不可靠 */
const flagFillStyle = (on?: boolean) => (on ? { fill: FLAG_FILL } : undefined)

const note = ref<JotNote | null>(null)
const atts = ref<JotAtt[]>([])
const tagInput = ref('')
const editingSeg = ref<{ att: string; idx: number } | null>(null)
const segDraft = ref('')
const aiBusy = ref('')
const aiResult = ref('')
const albumInput = ref<HTMLInputElement>()

const audios = computed(() => atts.value.filter(a => a.kind === 'audio'))
/** 有转写稿的语音（折叠区按需展开，不占正文高度） */
const transcriptAudios = computed(() => audios.value.filter(a => a.transcript?.length))
const openTranscript = ref(false)

let alive = true
let focusTimer = 0
let touched = false // 用户是否真正编辑过（打开笔记不触发保存）

onMounted(async () => {
  const n = await db.getNote(props.id)
  if (!alive) return // 已卸载：不写组件状态，避免重复 pop
  if (n) {
    normalizeNoteTodos(n) // 兜底：初始化迁移之外，单条读取也保证结构完整
    note.value = n
    atts.value = await db.attsOf(n.id)
  } else if (props.fresh) {
    note.value = newNote('text'); note.value.id = props.id
    // 位置写进本对象：空笔记的 persist 会被跳过，但用户一打字就随正文一起落库
    captureLocation(note.value)
  } else { pop(); return }
  setActiveNote(note.value)
  if (props.fresh) focusTimer = window.setTimeout(() => document.getElementById('jot-title')?.focus(), 60)
})

onBeforeUnmount(() => {
  alive = false
  window.clearTimeout(focusTimer)
  setActiveNote(null)
  if (note.value && !deleted) void flushSave(note.value) // 冲刷未保存编辑，防丢
})

// 仅在用户实际编辑后保存；打开笔记不写 updatedAt（避免纯查看触发同步/顶时间线）
watch(() => [note.value?.title, note.value?.text], () => {
  if (note.value && touched) saveDebounced(note.value)
})

function dirty() { touched = true; if (note.value) saveDebounced(note.value) }

/** 收藏：与置顶互不影响（置顶改排序，收藏只做标记 + 首页筛选） */
async function favIt() {
  const n = note.value
  if (!n) return
  await toggleFav(n)
  toast(n.fav ? '已收藏' : '已取消收藏')
}

// ─── 标签 ──
async function addTag() {
  const v = tagInput.value.trim().replace(/^@/, '')
  if (!v || !note.value) { tagInput.value = ''; return }
  if (!note.value.tags.includes(v)) note.value.tags.push(v)
  tagInput.value = ''
  await ensureTag(v)
  dirty()
}
function removeTag(t: string) {
  if (!note.value) return
  note.value.tags = note.value.tags.filter(x => x !== t)
  dirty()
}
const tagColorMap = computed(() => Object.fromEntries(tags.value.map(t => [t.name, t.color])))

// ─── 附件（导入/拍照/录像处理在 state/picker.ts） ──
const { pickAlbum, onPhotoFiles, onVideoFiles } = usePicker(note, atts, dirty)
const videoInput = ref<HTMLInputElement>()

/** 拍照（对齐 kurumi CameraCapture）：
 *  移动端 → 隐藏 <input capture> 直呼系统相机，无网页授权、无重复弹窗；
 *  桌面 → 进入实时取景（getUserMedia + 快门），拍完挂进当前笔记 */
const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const photoInput = ref<HTMLInputElement>()

function takePhoto() {
  if (!note.value) return
  if (isMobileUA) photoInput.value?.click()
  else push('camera', { noteId: note.value.id })
}

async function runOcr(att: JotAtt) {
  aiBusy.value = 'ocr'
  try {
    const r = await callJot('ocr_image', { attId: att.id })
    if (r?.ok) {
      att.ocrText = r.text; att.pendingOcr = false
      await updateAtt(att)
      toast('OCR 完成，文字已可搜索')
    } else toast(r?.message ?? 'OCR 暂不可用', false)
  } catch { toast('OCR 失败：需先同步媒体到服务端', false) } finally { aiBusy.value = '' }
}

// ─── 转写编辑 ──
function editSeg(att: JotAtt, idx: number) {
  editingSeg.value = { att: att.id, idx }
  segDraft.value = att.transcript?.[idx]?.text ?? ''
}
async function saveSeg(att: JotAtt) {
  const e = editingSeg.value
  if (e && att.transcript) {
    att.transcript[e.idx] = { ...att.transcript[e.idx], text: segDraft.value, edited: true }
    await updateAtt(att)
    dirty()
  }
  editingSeg.value = null
}

// ─── AI ──
async function summarize() {
  if (!note.value) return
  aiBusy.value = 'sum'; aiResult.value = ''
  try {
    const r = await callJot('summarize', { noteId: note.value.id })
    aiResult.value = r?.ok ? r.markdown : (r?.message ?? 'AI 未配置')
  } catch { aiResult.value = 'AI 服务不可用' } finally { aiBusy.value = '' }
}
// ─── 事项域：note.todos 独立字段，勾选/增删直接改数组并防抖保存 ──
const todos = computed<JotTodo[]>(() => note.value?.todos ?? [])
const todoDraft = ref('')
const showTodoInput = ref(false)
const todoInput = ref<HTMLInputElement>()

const todosDone = computed(() => todos.value.filter(t => t.done).length)
const todoPct = computed(() => (todos.value.length ? Math.round(todosDone.value / todos.value.length * 100) : 0))
/** 有事项 / 已打待办标志 / 正在添加：显示清单块 */
const todoVisible = computed(() =>
  todos.value.length > 0 || showTodoInput.value || note.value?.todo === true)

function toggleTodo(t: JotTodo) { t.done = !t.done; dirty() }
function removeTodo(i: number) {
  if (!note.value || i < 0) return
  note.value.todos?.splice(i, 1)
  dirty()
}
function addTodo() {
  const v = todoDraft.value.trim()
  if (!v || !note.value) return
  if (!note.value.todos) note.value.todos = []
  note.value.todos.push(newTodo(v))
  todoDraft.value = ''
  dirty()
}
/** 行内编辑的收尾：清空则删行，否则保存当前数组（回车 = 失焦，走同一路径） */
function commitTodo(t: JotTodo) {
  if (!t.text.trim()) removeTodo(todos.value.indexOf(t))
  else dirty()
}
function blurTodoInput(e: Event) { (e.target as HTMLElement | null)?.blur() }
/** 展开清单并聚焦新增输入（空清单也能加第一条） */
async function focusTodoAdd() {
  showTodoInput.value = true
  await nextTick()
  todoInput.value?.focus()
  todoInput.value?.scrollIntoView({ block: 'nearest' })
}
/** 新增输入失焦：有内容就顺手落成一条，避免白输 */
function commitDraft() {
  if (todoDraft.value.trim()) addTodo()
  else showTodoInput.value = false
}
/** 顶栏「待办」：切换标志（只决定卡型与待办页收录，不动事项） */
async function toggleTodoIt() {
  const n = note.value
  if (!n) return
  await toggleTodoFlag(n)
  toast(n.todo ? '已标记为待办笔记' : '已取消待办标志')
  if (n.todo) { showTodoInput.value = true; void focusTodoAdd() }
  else if (!todos.value.length) showTodoInput.value = false
}

/** AI 提取待办：能力保留，但不再占用顶栏（顶栏是待办标志） */
async function aiTodos() {
  if (!note.value) return
  aiBusy.value = 'todo'
  try {
    const r = await callJot('extract_todos', { noteId: note.value.id })
    const n = note.value
    if (r?.ok && r.todos.length && n) {
      if (!n.todos) n.todos = []
      for (const t of r.todos) n.todos.push(newTodo(`${t.text}${t.due ? `（${t.due}）` : ''}`))
      dirty(); toast(`已提取 ${r.todos.length} 条待办`)
    } else toast(r?.ok ? '未发现待办' : (r?.message ?? 'AI 未配置'), Boolean(r?.ok))
  } catch { toast('AI 服务不可用', false) } finally { aiBusy.value = '' }
}

let deleted = false

async function del() {
  if (!note.value || !confirm('删除这条笔记？（可从历史兜底恢复）')) return
  deleted = true // 卸载 flush 时跳过，防止删除后笔记被复活
  await removeNote(note.value)
  pop()
}

const metaLine = computed(() => {
  const n = note.value
  if (!n) return ''
  const bits = [fmtTime(n.createdAt)]
  if (n.location) bits.push(n.location.name ?? `${n.location.lat.toFixed(3)},${n.location.lng.toFixed(3)}`)
  return bits.join(' · ')
})
</script>

<template>
  <div v-if="note" class="jot-detail">
    <!-- 顶栏 -->
    <div class="jot-detail-head">
      <button type="button" class="jot-icon-btn" aria-label="返回" title="返回" @click="pop()">
        <component :is="icons.ChevronLeft" :size="20" />
      </button>
      <span class="jot-head-spacer" />
      <button
        type="button" class="jot-icon-btn" :style="flagStyle(note.pinned)"
        :aria-label="note.pinned ? '取消置顶' : '置顶'" :title="note.pinned ? '取消置顶' : '置顶'"
        :aria-pressed="note.pinned" @click="togglePin(note)"
      >
        <component :is="icons.Pin" :size="17" :style="flagFillStyle(note.pinned)" />
      </button>
      <button
        type="button" class="jot-icon-btn"
        :aria-label="note.todo ? '取消待办' : '标记待办'" :title="note.todo ? '取消待办' : '标记待办'"
        :aria-pressed="note.todo" @click="toggleTodoIt"
      >
        <!-- ListChecks 全是线段、没有可填的面积：开态用同一路径叠两层描边，
             下层粗墨线当外框、上层细金线当芯，做出「金线包墨边」 -->
        <span v-if="note.todo" class="jot-flag-stack">
          <component :is="icons.ListChecks" :size="17" :stroke-width="4" :style="{ stroke: FLAG_EDGE }" />
          <component :is="icons.ListChecks" :size="17" :stroke-width="2.6" :style="{ stroke: FLAG_FILL }" />
        </span>
        <component :is="icons.ListChecks" v-else :size="17" />
      </button>
      <button
        type="button" class="jot-icon-btn" :style="flagStyle(note.fav)"
        :aria-label="note.fav ? '取消收藏' : '收藏'" :title="note.fav ? '取消收藏' : '收藏'"
        :aria-pressed="note.fav" @click="favIt"
      >
        <component :is="icons.Star" :size="17" :style="flagFillStyle(note.fav)" />
      </button>
      <button type="button" class="jot-icon-btn jot-icon-btn-danger" aria-label="删除笔记" title="删除笔记" @click="del">
        <component :is="icons.Trash2" :size="17" />
      </button>
    </div>

    <p class="px-1 jot-fs-11 text-ink-2">{{ metaLine }}</p>

    <!-- 文字区：占屏幕上半，独立滚动 -->
    <div class="jot-editor-pane">
      <input
        id="jot-title" v-model="note.title" placeholder="标题"
        class="jot-editor-title"
        @input="touched = true"
      />
      <textarea
        v-model="note.text" placeholder="开始记录… @标签"
        class="jot-editor-text" :class="{ 'has-todos': todos.length > 0 }"
        @input="touched = true"
      />

      <!-- 事项域：独立字段（note.todos），勾选/行内改/增删直接保存数组 -->
      <div v-if="todoVisible" class="jot-todo-block">
        <div v-if="todos.length" class="jot-todo-block-head">
          <component :is="icons.ListChecks" :size="13" class="jot-todo-block-ico" />
          <span class="jot-todo-block-title">事项</span>
          <span class="jot-todo-block-count">{{ todosDone }}/{{ todos.length }}</span>
          <span class="jot-todo-bar"><i :style="{ width: todoPct + '%' }" /></span>
        </div>
        <div
          v-for="(t, i) in todos" :key="t.id"
          class="jot-todo-block-row" :class="{ 'is-done': t.done }"
        >
          <button
            type="button" class="jot-todo-check" :class="{ 'is-checked': t.done }"
            :aria-label="t.done ? '标记未完成' : '标记完成'" @click="toggleTodo(t)"
          >✓</button>
          <input
            v-model="t.text" class="jot-todo-block-input" placeholder="事项内容"
            @input="dirty" @blur="commitTodo(t)" @keyup.enter="blurTodoInput($event)"
          />
          <button type="button" class="jot-todo-block-del" aria-label="删除事项" @click="removeTodo(i)">
            <component :is="icons.X" :size="13" />
          </button>
        </div>
        <p v-if="note.todo && !todos.length" class="jot-todo-block-empty">还没有事项，添加一条试试</p>
        <input
          v-if="showTodoInput" ref="todoInput" v-model="todoDraft"
          class="jot-todo-block-add" placeholder="添加事项，回车确认"
          @keyup.enter="addTodo" @blur="commitDraft"
        />
        <button v-else type="button" class="jot-todo-block-more" @click="focusTodoAdd">＋ 添加事项</button>
      </div>

      <!-- AI 摘要（原顶栏按钮下沉到正文下方，顶栏只留 置顶/收藏/待办/删除） -->
      <div class="jot-detail-ai">
        <button type="button" class="jot-ai-chip" :disabled="aiBusy === 'sum'" @click="summarize">
          <component :is="icons.Sparkles" :size="13" />{{ aiBusy === 'sum' ? '摘要中…' : 'AI 摘要' }}
        </button>
        <button type="button" class="jot-ai-chip" :disabled="aiBusy === 'todo'" @click="aiTodos">
          <component :is="icons.Sparkles" :size="13" />{{ aiBusy === 'todo' ? '提取中…' : 'AI 提取待办' }}
        </button>
      </div>

      <!-- AI 结果 -->
      <div v-if="aiResult" class="mt-3 rounded-card bg-bg-1 p-4 shadow-card">
        <div class="mb-1 flex items-center justify-between">
          <span class="flex items-center gap-1.5 jot-fs-12 font-medium text-brand">
            <component :is="icons.Sparkles" :size="13" />AI 摘要
          </span>
          <button type="button" class="cursor-pointer text-ink-2" @click="aiResult = ''">
            <component :is="icons.X" :size="14" />
          </button>
        </div>
        <p class="whitespace-pre-wrap jot-fs-13 leading-6 text-ink-1">{{ aiResult }}</p>
      </div>

      <!-- 标签（跟随文字区一起滚动） -->
      <div class="jot-tag-row">
        <TagChip v-for="t in note.tags" :key="t" :name="t" :color="tagColorMap[t]" removable @remove="removeTag(t)" />
        <input
          v-model="tagInput" placeholder="+ 标签" list="jot-tags"
          class="w-20 rounded-full bg-bg-1 px-2.5 py-1 jot-fs-115 text-ink-0 outline-none placeholder:text-ink-2/60"
          @keyup.enter="addTag"
        />
        <datalist id="jot-tags"><option v-for="t in tags" :key="t.name" :value="t.name" /></datalist>
      </div>
    </div>

    <!-- 附件：横滑缩略条（小红书画风，不占正文高度） -->
    <div v-if="atts.length" class="jot-media-block">
      <div class="jot-media-head">
        <span class="jot-media-count">附件 {{ atts.length }}</span>
        <button
          v-if="transcriptAudios.length" type="button" class="jot-media-toggle"
          @click="openTranscript = !openTranscript"
        >
          <component :is="icons.Mic" :size="12" />转写 {{ transcriptAudios.length }}{{ openTranscript ? ' · 收起' : '' }}
        </button>
      </div>
      <MediaShelf :atts="atts" @ocr="runOcr" />

      <!-- 转写稿：默认折叠，展开后自带滚动，仍不挤压正文 -->
      <div v-if="openTranscript" class="jot-transcript-panel">
        <div v-for="a in transcriptAudios" :key="a.id" class="jot-transcript-group">
          <p class="jot-transcript-label">转写稿（点句可改）</p>
          <div v-for="(s, i) in a.transcript" :key="i" class="group flex gap-2 py-0.5 jot-fs-13 leading-6">
            <template v-if="editingSeg?.att === a.id && editingSeg.idx === i">
              <input v-model="segDraft" class="flex-1 rounded bg-bg-2 px-2 py-0.5 outline-none" @keyup.enter="saveSeg(a)" />
              <button type="button" class="cursor-pointer text-brand" @click="saveSeg(a)">存</button>
            </template>
            <template v-else>
              <span class="shrink-0 font-mono jot-fs-11 leading-6 text-ink-2">{{ Math.floor(s.t0 / 60) }}:{{ String(Math.floor(s.t0 % 60)).padStart(2, '0') }}</span>
              <span class="cursor-pointer text-ink-0" :class="{ 'text-brand-soft': s.edited }" @click="editSeg(a, i)">{{ s.text }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部附件入口 -->
    <div class="jot-detail-actions">
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="takePhoto">
        <component :is="icons.Camera" :size="15" />拍照
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="albumInput?.click()">
        <component :is="icons.ImagePlus" :size="15" />添加相片
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="push('record', { noteId: note.id })">
        <component :is="icons.Mic" :size="15" />录音
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 jot-fs-125 text-ink-1 shadow-card" @click="videoInput?.click()">
        <component :is="icons.Video ?? icons.Camera" :size="15" />视频
      </button>
      <input ref="albumInput" type="file" accept="image/*,video/*" multiple class="hidden" @change="pickAlbum(($event.target as HTMLInputElement).files)" />
      <!-- kurumi 同款：移动端经 capture 直呼系统相机（免网页授权）；桌面不点它（走实时取景） -->
      <input ref="photoInput" type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onPhotoFiles(($event.target as HTMLInputElement).files)" />
      <!-- 视频同理：capture 唤起系统相机录像模式 -->
      <input ref="videoInput" type="file" accept="video/*" capture="environment" class="hidden" @change="onVideoFiles(($event.target as HTMLInputElement).files)" />
    </div>
  </div>
  <Empty v-else icon="FileQuestion" title="笔记不存在" />
</template>
