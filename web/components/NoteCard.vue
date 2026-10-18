<script setup lang="ts">
/** NoteCard — 时间线卡片：六类卡型，尺寸固定、内容即类型。
 *  文字卡 = 哈希取色语录卡（1:1 方卡，无标题时正文即标题）；
 *  待办卡 = 由 note.todo 标志决定：3:4，只显示 标题 → 正文 → 事项清单，附件一律让位；
 *  图片卡 = 满幅封面（3:4，点图全屏预览）；视频卡 = 海报封面（3:4，▶ + 时长角标，点封面全屏播放）；
 *  纯语音卡 = 长条（原语音条形态不变，约 76px，点语音条播放、点其余处进编辑）；
 *  复合卡 = 3:4 与图片卡同尺寸：标题 → 正文 → 事项清单 / 媒体（有清单时清单占位、媒体不上卡）。
 *  底部统一 CardFoot：左时间，右「⋯」（菜单由 App 级 CardMenu 承载）。 */
import { computed, ref } from 'vue'
import { toast, useUi, type JotAtt, type JotNote } from '../host'
import { useMedia } from '../lib/useMedia'
import MediaPreview from './MediaPreview.vue'
import CardFoot from './CardFoot.vue'
import { dayLabel, fmtClock, fmtBytes, fmtDur } from '../lib/format'
import { hashCardColor } from '../lib/color'
import { useAudioPlayer } from '../lib/useAudioPlayer'
import ImgViewer from './ImgViewer.vue'
import VideoViewer from './VideoViewer.vue'
import { askConfirm } from '../state/confirm'
import { todoStat as computeTodoStat } from '../lib/todos'
import { togglePin } from '../state/store'

const props = withDefaults(defineProps<{
  note: JotNote
  tagColors?: Record<string, string | null>
  /** 时间线按天分组时组头已显示日期，卡片内隐藏避免重复 */
  showDay?: boolean
  /** 日历时间轴已显示时刻，卡内隐藏时间避免重复 */
  showTime?: boolean
  /** 只读卡（日历远端列表）：隐藏置顶角标与「⋯」菜单，避免对卡片投影做写入 */
  readonly?: boolean
}>(), { showDay: true, showTime: true, readonly: false })
const emit = defineEmits<{ open: [] }>()
const icons = useUi().icons

type CardType = 'text' | 'image' | 'voice' | 'video' | 'todo' | 'composite'

const imageAtts = computed<JotAtt[]>(() => props.note.atts?.filter(a => a.kind === 'image') ?? [])
const audioAtt = computed<JotAtt | null>(() => props.note.atts?.find(a => a.kind === 'audio') ?? null)
const videoAtt = computed<JotAtt | null>(() => props.note.atts?.find(a => a.kind === 'video') ?? null)

/** 视频封面角标：时长 · 大小（老数据无 size 时只显时长） */
const vidBadge = computed(() => {
  const a = videoAtt.value
  if (!a) return ''
  const parts: string[] = []
  if (a.duration) parts.push(fmtDur(a.duration))
  if (a.size) parts.push(fmtBytes(a.size))
  return parts.join(' · ')
})

/** 事项来自独立字段，正文不再夹带 - [ ] 行 */
const todos = computed(() => props.note.todos ?? [])
const todosDone = computed(() => todos.value.filter(t => t.done).length)
const stat = computed(() => computeTodoStat(todos.value))
const todoStat = computed(() => (stat.value.total
  ? { done: stat.value.done, total: stat.value.total }
  : null))
const todoPct = computed(() => stat.value.pct)
/** 卡面最多放五行，余下的用「还有 n 条」收口 */
const cardTodos = computed(() => todos.value.slice(0, 5))
/** 正文（剥 markdown 标记） */
const text = computed(() => (props.note.text || '').replace(/^#+\s*/gm, '').trim())

/** 是否算「有文字」：标题/事项也算，避免纯清单笔记被压成语音条 */
const hasText = computed(() =>
  Boolean(props.note.title) || text.value.length > 0 || todos.value.length > 0)

/** 卡片类型：待办标志优先（3:4 只露清单）；
 *  无附件 → 文字卡；纯媒体 → 图片/视频/语音；其余（媒体 + 文字/事项、图音混合）→ 复合卡 */
const cardType = computed<CardType>(() => {
  if (props.note.todo) return 'todo'
  const hasImg = imageAtts.value.length > 0
  const hasAud = Boolean(audioAtt.value)
  const hasVid = Boolean(videoAtt.value)
  if (!hasImg && !hasAud && !hasVid) return 'text'
  if (hasAud && !hasImg && !hasVid && !hasText.value) return 'voice'
  if (hasVid && !hasImg && !hasAud && !hasText.value) return 'video'
  if (hasImg && !hasAud && !hasVid && !hasText.value) return 'image'
  return 'composite'
})

/** 标题：无标题时取正文首行，纯清单笔记取第一条事项 */
const title = computed(() =>
  props.note.title || text.value.split('\n')[0] || todos.value[0]?.text || '')
const body = computed(() =>
  props.note.title ? text.value : text.value.split('\n').slice(1).join(' ').trim())

/** 卡面首行：有清单时不再把第一条待办当标题重复一遍，清单自己会说话 */
const heading = computed(() => props.note.title || (todos.value.length ? '' : title.value))

/** 文字彩卡底色：首字哈希取色（确定性，同一笔记永远同色） */
const tcStyle = computed(() => hashCardColor(props.note.title || text.value))

/** 查看器与封面独立持有原图 URL，后台恢复时重新解析。 */
const previewAtt = ref<JotAtt | null>(null)
const videoSelection = ref<JotAtt | null>(null)
const { src: preview, failed: previewFailed } = useMedia(() => previewAtt.value, true)
const { src: playUrl, failed: videoFailed } = useMedia(() => videoSelection.value, true)
function openPreview() { previewAtt.value = imageAtts.value[0] ?? null }
function playVideo() { videoSelection.value = videoAtt.value }

/** 语音播放：纯语音卡与复合卡内的语音条各自独立实例 */
const { playing: compPlaying, progress: compProgress, toggle: compToggle } = useAudioPlayer(() => audioAtt.value)
const { playing: voicePlaying, progress: voiceProgress, toggle: voiceToggle } = useAudioPlayer(() => audioAtt.value)

/** 波形：优先真实 peaks，无 peaks 的老录音用静态装饰波形 */
const PLACEHOLDER = [0.32, 0.55, 0.78, 0.5, 0.9, 0.62, 0.4, 0.7, 0.45, 0.85, 0.58, 0.36, 0.66, 0.48, 0.74, 0.42, 0.6, 0.3]
function makeBars(peaks: number[] | undefined, count: number) {
  const src = peaks?.length ? peaks : PLACEHOLDER
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(src[Math.floor(i / count * src.length)] ?? 0.05)
  return out
}
const voiceBars = computed(() => makeBars(audioAtt.value?.peaks, 26))
const compBars = computed(() => makeBars(audioAtt.value?.peaks, 22))

const timeLabel = computed(() => {
  if (!props.showTime) return ''
  return (props.showDay ? dayLabel(props.note.createdAt) + ' ' : '') + fmtClock(props.note.createdAt)
})

/** 点右上角置顶角标：先确认再取消置顶（避免误触把置顶弄丢），角标点击不冒泡进详情 */
async function unpinByBadge() {
  const name = (props.note.title || text.value).slice(0, 18)
  const ok = await askConfirm({
    title: '取消置顶？',
    message: name ? `「${name}」会回到时间线` : '这条笔记会回到时间线',
    confirmText: '取消置顶',
    danger: true,
  })
  if (!ok) return
  if (await togglePin(props.note)) toast('已取消置顶')
}
</script>

<template>
  <!-- 纯语音卡：长条语音条（形态不变）+ 信息行；点语音条播放，点其余处进编辑 -->
  <article
    v-if="cardType === 'voice'"
    class="jot-card jot-card-voice"
    :class="{ 'opacity-60': note.deleted, 'is-pinned': note.pinned }"
    @click="emit('open')"
  >
    <button
      v-if="note.pinned && !readonly" type="button" class="jot-card-pin"
      title="已置顶，点击取消" aria-label="取消置顶"
      @click.stop="unpinByBadge"
    >
      <component :is="icons.Pin" :size="12" />
    </button>
    <div
      class="jot-voicebar" role="button"
      :aria-label="voicePlaying ? '暂停语音' : '播放语音'"
      @click.stop="voiceToggle"
    >
      <span class="jot-voicebar-play">
        <component :is="voicePlaying ? icons.Pause : icons.Play" :size="13" />
      </span>
      <span class="jot-voicebar-wave">
        <span
          v-for="(p, i) in voiceBars" :key="i"
          class="jot-voicebar-bar"
          :style="{ height: Math.max(3, p * 20) + 'px', opacity: i / voiceBars.length <= voiceProgress ? 1 : 0.3 + p * 0.4 }"
        />
      </span>
      <span class="jot-voicebar-dur">{{ fmtDur(audioAtt?.duration) }}</span>
    </div>
    <CardFoot :note="note" :time="timeLabel" :title="note.title || ''" :todo="todoStat" :readonly="readonly" />
  </article>

  <!-- 其余四类：固定比例卡 -->
  <article
    v-else
    class="jot-card"
    :class="[cardType === 'text' ? 'jot-card-text' : 'jot-card-std', { 'opacity-60': note.deleted, 'is-pinned': note.pinned }]"
    @click="emit('open')"
  >
    <!-- 置顶角标：右上角统一位置，不参与文字流 -->
    <button
      v-if="note.pinned && !readonly" type="button" class="jot-card-pin"
      title="已置顶，点击取消" aria-label="取消置顶"
      @click.stop="unpinByBadge"
    >
      <component :is="icons.Pin" :size="12" />
    </button>

    <!-- 文字卡：彩底语录 -->
    <div v-if="cardType === 'text'" class="jot-textcard" :style="tcStyle">
      <p class="jot-tc-quote">{{ title || '·' }}</p>
      <p v-if="body" class="jot-tc-sub">{{ body }}</p>
      <CardFoot :note="note" :time="timeLabel" :todo="todoStat" :readonly="readonly" class="jot-tc-cardfoot" />
    </div>

    <!-- 图片卡：满幅封面，点图预览 -->
    <template v-else-if="cardType === 'image'">
      <div class="jot-imgcard" @click.stop="openPreview">
        <MediaPreview :att="imageAtts[0]" />
        <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
      </div>
      <CardFoot :note="note" :time="timeLabel" :todo="todoStat" :readonly="readonly" />
    </template>

    <!-- 视频卡：海报封面 + 中央 ▶ + 左下时长角标，点封面全屏播放 -->
    <template v-else-if="cardType === 'video'">
      <div class="jot-imgcard" @click.stop="playVideo">
        <MediaPreview :att="videoAtt" />
        <span class="jot-vid-play"><component :is="icons.Play" :size="18" /></span>
        <span v-if="vidBadge" class="jot-vid-dur">{{ vidBadge }}</span>
      </div>
      <CardFoot :note="note" :time="timeLabel" :todo="todoStat" :readonly="readonly" />
    </template>

    <!-- 复合卡：标题 → 正文 → （有清单时只显示清单）→ 媒体，整卡 3:4 -->
    <template v-else>
      <div v-if="heading || body" class="jot-comp-body">
        <h3 class="jot-clamp-2 jot-fs-125 font-semibold leading-snug text-ink-0">{{ heading }}</h3>
        <p v-if="body" class="jot-clamp-2 jot-fs-11 mt-0.5 leading-relaxed text-ink-1">{{ body }}</p>
      </div>

      <!-- 事项域：有清单就占满卡面剩余空间，图 / 视频 / 语音一概不显示 -->
      <div v-if="todos.length" class="jot-comp-todos">
        <div class="jot-comp-todos-head">
          <span class="jot-comp-todos-title">事项</span>
          <span class="jot-comp-todos-count">{{ todosDone }}/{{ todos.length }}</span>
          <span class="jot-comp-todos-bar"><i :style="{ width: todoPct + '%' }" /></span>
        </div>
        <div
          v-for="t in cardTodos" :key="t.id"
          class="jot-comp-todo" :class="{ 'is-done': t.done }"
        >
          <span class="jot-comp-todo-box">{{ t.done ? '✓' : '' }}</span>
          <span class="jot-comp-todo-text">{{ t.text }}</span>
        </div>
        <div v-if="todos.length > cardTodos.length" class="jot-comp-todos-more">
          还有 {{ todos.length - cardTodos.length }} 条
        </div>
      </div>

      <!-- 待办卡但还没填事项：给一句空态提示，避免卡面只剩标题 -->
      <p v-else-if="cardType === 'todo'" class="jot-comp-todos-empty">还没有事项，点开添加</p>

      <div
        v-else
        class="jot-comp-media"
        @click.stop="imageAtts.length ? openPreview() : videoAtt ? playVideo() : null"
      >
        <!-- 图（多图角标） -->
        <template v-if="imageAtts.length">
          <MediaPreview :att="imageAtts[0]" />
          <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
        </template>
        <!-- 视频海报 -->
        <template v-else-if="videoAtt">
          <MediaPreview :att="videoAtt" />
          <span class="jot-vid-play"><component :is="icons.Play" :size="18" /></span>
          <span v-if="vidBadge" class="jot-vid-dur">{{ vidBadge }}</span>
        </template>
        <!-- 纯语音条作为主媒体 -->
        <div
          v-else-if="audioAtt" class="jot-comp-voicepad"
          role="button"
          :aria-label="compPlaying ? '暂停语音' : '播放语音'"
          @click.stop="compToggle"
        >
          <div class="jot-voicebar">
            <span class="jot-voicebar-play">
              <component :is="compPlaying ? icons.Pause : icons.Play" :size="13" />
            </span>
            <span class="jot-voicebar-wave">
              <span
                v-for="(p, i) in compBars" :key="i"
                class="jot-voicebar-bar"
                :style="{ height: Math.max(3, p * 18) + 'px', opacity: i / compBars.length <= compProgress ? 1 : 0.3 + p * 0.4 }"
              />
            </span>
            <span class="jot-voicebar-dur">{{ fmtDur(audioAtt.duration) }}</span>
          </div>
        </div>

        <!-- 图 / 视频 + 语音：玻璃小胶囊，不抢版面 -->
        <button
          v-if="audioAtt && (imageAtts.length || videoAtt)"
          type="button" class="jot-comp-voicechip"
          :aria-label="compPlaying ? '暂停语音' : '播放语音'"
          @click.stop="compToggle"
        >
          <component :is="compPlaying ? icons.Pause : icons.Play" :size="11" />{{ fmtDur(audioAtt.duration) }}
        </button>
      </div>

      <!-- 待办已在卡面单列，脚下不再重复进度胶囊 -->
      <CardFoot :note="note" :time="timeLabel" :readonly="readonly" />
    </template>

    <!-- 全屏图片预览 / 视频播放 -->
    <ImgViewer :src="preview" @close="previewAtt = null" @error="previewFailed" />
    <VideoViewer :src="playUrl" @close="videoSelection = null" @error="videoFailed" />
  </article>
</template>
