<script setup lang="ts">
/** Detail — 屏② 笔记详情：标题/正文、图片九宫格、音频卡、转写编辑、
 *  标签、元数据、OCR / AI 摘要 / 提取待办 / 置顶 / 删除。 */
import { computed, onMounted, ref, watch } from 'vue'
import { callJot, mediaUrl, toast, useUi, type JotAtt, type JotNote, type Seg } from '../host'
import { pop, push } from '../lib/nav'
import { fmtTime } from '../lib/format'
import {
  attachImage, ensureTag, invalidateCover, newNote, removeNote,
  saveDebounced, tagColor, tags, togglePin, updateAtt,
} from '../state/store'
import * as db from '../lib/db'
import ImgGrid from '../components/ImgGrid.vue'
import AudioCard from '../components/AudioCard.vue'
import TagChip from '../components/TagChip.vue'
import Empty from '../components/Empty.vue'

const props = defineProps<{ id: string; fresh?: string }>()
const icons = useUi().icons

const note = ref<JotNote | null>(null)
const atts = ref<JotAtt[]>([])
const tagInput = ref('')
const editingSeg = ref<{ att: string; idx: number } | null>(null)
const segDraft = ref('')
const aiBusy = ref('')
const aiResult = ref('')
const albumInput = ref<HTMLInputElement>()

const images = computed(() => atts.value.filter(a => a.kind === 'image'))
const audios = computed(() => atts.value.filter(a => a.kind === 'audio'))

onMounted(async () => {
  const n = await db.getNote(props.id)
  if (n) {
    note.value = n
    atts.value = await db.attsOf(n.id)
  } else if (props.fresh) {
    note.value = newNote('text'); note.value.id = props.id
  } else { pop(); return }
  if (props.fresh) setTimeout(() => document.getElementById('jot-title')?.focus(), 60)
})

watch(() => [note.value?.title, note.value?.text], () => {
  if (note.value) saveDebounced(note.value)
})

function dirty() { if (note.value) saveDebounced(note.value) }

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

// ─── 附件 ──
async function pickAlbum(files: FileList | null) {
  if (!files || !note.value) return
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue
    const a = await attachImage(note.value.id, f)
    atts.value.push(a)
  }
  invalidateCover(note.value.id)
  dirty()
  toast(`已导入 ${files.length} 张图片`)
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
async function todos() {
  if (!note.value) return
  aiBusy.value = 'todo'
  try {
    const r = await callJot('extract_todos', { noteId: note.value.id })
    if (r?.ok && r.todos.length) {
      const lines = r.todos.map((t: any) => `- [ ] ${t.text}${t.due ? `（${t.due}）` : ''}`)
      note.value.text = (note.value.text ? note.value.text + '\n' : '') + lines.join('\n')
      dirty(); toast(`已提取 ${r.todos.length} 条待办`)
    } else toast(r?.ok ? '未发现待办' : (r?.message ?? 'AI 未配置'), Boolean(r?.ok))
  } catch { toast('AI 服务不可用', false) } finally { aiBusy.value = '' }
}

async function del() {
  if (!note.value || !confirm('删除这条笔记？（可从历史兜底恢复）')) return
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
  <div v-if="note" class="mx-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto px-4 pb-28 pt-3">
    <!-- 顶栏 -->
    <div class="sticky top-0 z-10 -mx-4 flex items-center gap-1 bg-bg-0/85 px-3 py-2 backdrop-blur-xl">
      <button type="button" class="cursor-pointer rounded-full p-2 text-ink-1 hover:bg-glass" @click="pop()">
        <component :is="icons.ChevronLeft" :size="20" />
      </button>
      <span class="flex-1" />
      <button type="button" class="cursor-pointer rounded-full p-2 text-ink-1 hover:bg-glass" @click="togglePin(note)">
        <component :is="icons.Pin" :size="17" :class="{ 'text-brand': note.pinned }" />
      </button>
      <button type="button" class="cursor-pointer rounded-full p-2 text-ink-1 hover:bg-glass" :disabled="aiBusy === 'sum'" @click="summarize">
        <component :is="icons.Sparkles" :size="17" />
      </button>
      <button type="button" class="cursor-pointer rounded-full p-2 text-ink-1 hover:bg-glass" :disabled="aiBusy === 'todo'" @click="todos">
        <component :is="icons.ListChecks" :size="17" />
      </button>
      <button type="button" class="cursor-pointer rounded-full p-2 text-err/80 hover:bg-glass" @click="del">
        <component :is="icons.Trash2" :size="17" />
      </button>
    </div>

    <p class="px-1 text-[11px] text-ink-2">{{ metaLine }}</p>

    <input
      id="jot-title" v-model="note.title" placeholder="标题"
      class="mt-2 w-full bg-transparent text-[22px] font-bold text-ink-0 outline-none placeholder:text-ink-2/60"
    />
    <textarea
      v-model="note.text" placeholder="开始记录… 支持 - [ ] 待办、@标签"
      class="mt-2 min-h-40 w-full flex-1 resize-none bg-transparent text-[15px] leading-6 text-ink-0 outline-none placeholder:text-ink-2/60"
    />

    <!-- AI 结果 -->
    <div v-if="aiResult" class="mt-3 rounded-card bg-bg-1 p-4 shadow-card">
      <div class="mb-1 flex items-center justify-between">
        <span class="flex items-center gap-1.5 text-[12px] font-medium text-brand">
          <component :is="icons.Sparkles" :size="13" />AI 摘要
        </span>
        <button type="button" class="cursor-pointer text-ink-2" @click="aiResult = ''">
          <component :is="icons.X" :size="14" />
        </button>
      </div>
      <p class="whitespace-pre-wrap text-[13px] leading-6 text-ink-1">{{ aiResult }}</p>
    </div>

    <!-- 图片 -->
    <ImgGrid v-if="images.length" class="mt-3" :atts="images" @ocr="runOcr" />

    <!-- 音频 + 转写 -->
    <div v-for="a in audios" :key="a.id" class="mt-3">
      <AudioCard :att="a" />
      <div v-if="a.transcript?.length" class="mt-2 rounded-card bg-bg-1 p-3.5">
        <p class="mb-1.5 text-[11px] font-medium tracking-wide text-ink-2">转写稿（点句可改）</p>
        <div v-for="(s, i) in a.transcript" :key="i" class="group flex gap-2 py-0.5 text-[13px] leading-6">
          <template v-if="editingSeg?.att === a.id && editingSeg.idx === i">
            <input v-model="segDraft" class="flex-1 rounded bg-bg-2 px-2 py-0.5 outline-none" @keyup.enter="saveSeg(a)" />
            <button type="button" class="cursor-pointer text-brand" @click="saveSeg(a)">存</button>
          </template>
          <template v-else>
            <span class="shrink-0 font-mono text-[11px] leading-6 text-ink-2">{{ Math.floor(s.t0 / 60) }}:{{ String(Math.floor(s.t0 % 60)).padStart(2, '0') }}</span>
            <span class="cursor-pointer text-ink-0" :class="{ 'text-brand-soft': s.edited }" @click="editSeg(a, i)">{{ s.text }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- 标签 -->
    <div class="mt-4 flex flex-wrap items-center gap-1.5">
      <TagChip v-for="t in note.tags" :key="t" :name="t" :color="tagColorMap[t]" removable @remove="removeTag(t)" />
      <input
        v-model="tagInput" placeholder="+ 标签" list="jot-tags"
        class="w-20 rounded-full bg-bg-1 px-2.5 py-1 text-[11.5px] text-ink-0 outline-none placeholder:text-ink-2/60"
        @keyup.enter="addTag"
      />
      <datalist id="jot-tags"><option v-for="t in tags" :key="t.name" :value="t.name" /></datalist>
    </div>

    <!-- 底部附件入口 -->
    <div class="mt-5 flex gap-2">
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 text-[12.5px] text-ink-1 shadow-card" @click="albumInput?.click()">
        <component :is="icons.ImagePlus" :size="15" />添加相片
      </button>
      <button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg-1 px-3.5 py-2 text-[12.5px] text-ink-1 shadow-card" @click="push('record', { noteId: note.id })">
        <component :is="icons.Mic" :size="15" />录音
      </button>
      <input ref="albumInput" type="file" accept="image/*" multiple class="hidden" @change="pickAlbum(($event.target as HTMLInputElement).files)" />
    </div>
  </div>
  <Empty v-else icon="FileQuestion" title="笔记不存在" />
</template>
