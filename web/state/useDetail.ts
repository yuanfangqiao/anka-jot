/** Detail — 屏② 笔记详情：正文自然展开、详情统一滚动，
 *  下半附件横滑缩略（图/视频/语音统一 3:4 瓷贴），转写折叠；
 *  顶栏：置顶 / 待办标志 / 收藏 / 删除；
 *  正文下方：事项清单（独立字段 note.todos）、OCR、AI 摘要 / AI 提取待办、标签。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { trackNote } from './persistence'
import { useEditorUpdates } from '../lib/useEditorUpdates'

export function useDetail(props: { id: string; fresh?: string; pasted?: string }) {
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
const updates = useEditorUpdates(note, atts)

const audios = computed(() => atts.value.filter(a => a.kind === 'audio'))
/** 有转写稿的语音（折叠区按需展开，不占正文高度） */
const transcriptAudios = computed(() => audios.value.filter(a => a.transcript?.length))
const openTranscript = ref(false)

let alive = true
let focusTimer = 0


onMounted(async () => {
  const n = await db.getNote(props.id)
  if (!alive) return // 已卸载：不写组件状态，避免重复 pop
  if (n) {
    normalizeNoteTodos(n) // 兜底：初始化迁移之外，单条读取也保证结构完整
    note.value = trackNote(n)
    atts.value = await db.attsOf(n.id)
  } else if (props.fresh) {
    note.value = newNote('text'); note.value.id = props.id; trackNote(note.value)
    // 位置写进本对象：空笔记的 persist 会被跳过，但用户一打字就随正文一起落库
    captureLocation(note.value)
  } else { pop(); return }
  setActiveNote(note.value)
  if (props.fresh) focusTimer = window.setTimeout(() => document.getElementById('jot-title')?.focus(), 60)
  else if (props.pasted) {
    await nextTick()
    const body = updates.bodyInput.value
    body?.focus()
    body?.setSelectionRange(body.value.length, body.value.length)
  }
})

onBeforeUnmount(() => {
  alive = false
  window.clearTimeout(focusTimer)
  setActiveNote(null)
  if (note.value && !deleted) void flushSave(note.value).catch(() => {}) // 冲刷未保存编辑，防丢
})

function dirty() { if (note.value) saveDebounced(note.value) }

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
/** 先收下当前草稿，再聚焦下一条；失焦已提交时 addTodo 为空操作。 */
async function focusTodoAdd() {
  addTodo()
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

return { icons, FLAG_EDGE, FLAG_FILL, flagStyle, flagFillStyle, note, atts, tagInput,
  editingSeg, segDraft, aiBusy, aiResult, albumInput, transcriptAudios, openTranscript,
  tagColorMap, tags, videoInput, photoInput, takePhoto, pickAlbum, onPhotoFiles, onVideoFiles,
  runOcr, editSeg, saveSeg, summarize, todos, todosDone, todoPct, todoVisible, todoInput,
  todoDraft, showTodoInput, toggleTodo, removeTodo, commitTodo, blurTodoInput,
  focusTodoAdd, addTodo, commitDraft, toggleTodoIt, aiTodos, del, metaLine, favIt,
  dirty, togglePin, pop, push, ...updates }
}
