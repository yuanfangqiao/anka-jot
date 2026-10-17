<script setup lang="ts">
/** NoteCard — 主页时间线卡片：按内容分五类，尺寸固定、内容即类型。
 *  文字卡 = 哈希取色语录卡（1:1 方卡，无标题时正文即标题）；图片卡 = 满幅封面（3:4，点图全屏预览）；
 *  视频卡 = 海报封面（3:4，▶ + 时长角标，点封面全屏播放）；语音卡 = 64px 矮条语音条；
 *  复合卡 = 3:4 上封面（图或视频海报）下文（封面点预览/播放、文区进详情）。 */
import { computed, ref } from 'vue'
import { useUi, type JotAtt, type JotNote } from '../host'
import { useMedia } from '../lib/useMedia'
import MediaPreview from './MediaPreview.vue'
import { dayLabel, fmtClock, fmtBytes, fmtDur } from '../lib/format'
import { hashCardColor } from '../lib/color'
import { useAudioPlayer } from '../lib/useAudioPlayer'
import ImgViewer from './ImgViewer.vue'
import VideoViewer from './VideoViewer.vue'
import VoiceMini from './VoiceMini.vue'

const props = withDefaults(defineProps<{
  note: JotNote
  tagColors?: Record<string, string | null>
  /** 时间线按天分组时组头已显示日期，卡片内隐藏避免重复 */
  showDay?: boolean
  /** 日历时间轴已显示时刻，卡内隐藏时间避免重复 */
  showTime?: boolean
}>(), { showDay: true, showTime: true })
const emit = defineEmits<{ open: [] }>()
const icons = useUi().icons

type CardType = 'text' | 'image' | 'voice' | 'video' | 'composite'

const imageAtts = computed<JotAtt[]>(() => props.note.atts?.filter(a => a.kind === 'image') ?? [])
const audioAtt = computed<JotAtt | null>(() => props.note.atts?.find(a => a.kind === 'audio') ?? null)
const videoAtt = computed<JotAtt | null>(() => props.note.atts?.find(a => a.kind === 'video') ?? null)

/** 视频封面角标：时长 · 大小（旧数据无 size 时只显时长） */
const vidBadge = computed(() => {
  const a = videoAtt.value
  if (!a) return ''
  const parts: string[] = []
  if (a.duration) parts.push(fmtDur(a.duration))
  if (a.size) parts.push(fmtBytes(a.size))
  return parts.join(' · ')
})

/** 正文（剥 markdown 标记） */
const text = computed(() =>
  (props.note.text || '').replace(/^#+\s*/gm, '').replace(/[-*] \[[ x]\] /g, '☐ ').trim())

/** 卡片类型判定：纯语音 / 纯视频 / 纯图片 / 纯文字 / 其余一律复合 */
const cardType = computed<CardType>(() => {
  const hasImg = imageAtts.value.length > 0
  const hasAud = Boolean(audioAtt.value)
  const hasVid = Boolean(videoAtt.value)
  const hasTxt = text.value.length > 0
  if (hasAud && !hasImg && !hasTxt && !hasVid) return 'voice'
  if (hasVid && !hasImg && !hasTxt && !hasAud) return 'video'
  if (hasImg && !hasTxt && !hasAud && !hasVid) return 'image'
  if (!hasImg && !hasAud && !hasVid) return 'text'
  return 'composite'
})

/** 标题：无标题时取正文首行（文字卡直接以正文为主角，不再出现「未命名」） */
const title = computed(() => props.note.title || text.value.split('\n')[0] || '')
const body = computed(() =>
  props.note.title ? text.value : text.value.split('\n').slice(1).join(' ').trim())

/** 文字彩卡底色：首字哈希取色（确定性，同一笔记永远同色） */
const tcStyle = computed(() => hashCardColor(props.note.title || text.value))

/** 查看器与封面独立持有原图 URL，后台恢复时重新解析。 */
const previewAtt = ref<JotAtt | null>(null)
const videoSelection = ref<JotAtt | null>(null)
const { src: preview, failed: previewFailed } = useMedia(() => previewAtt.value, true)
const { src: playUrl, failed: videoFailed } = useMedia(() => videoSelection.value, true)
function openPreview() { previewAtt.value = imageAtts.value[0] ?? null }
function playVideo() { videoSelection.value = videoAtt.value }

/** 复合卡封面：有图用图，无图用视频海报 */
const hasCover = computed(() => imageAtts.value.length > 0 || Boolean(videoAtt.value))

/** 复合卡迷你播放钮（与语音小卡同源播放逻辑） */
const { playing: compPlaying, toggle: compToggle } = useAudioPlayer(() => audioAtt.value)

const timeLabel = computed(() => {
  if (!props.showTime) return ''
  return (props.showDay ? dayLabel(props.note.createdAt) + ' ' : '') + fmtClock(props.note.createdAt)
})

/** 底部信息行只在有内容时占位（日历隐藏时间后不留空条） */
const metaVisible = computed(() =>
  Boolean(timeLabel.value) || props.note.syncState !== 'synced')
const footVisible = computed(() => Boolean(title.value) || metaVisible.value)
</script>

<template>
  <!-- 语音小卡：矮条语音条独立分发 -->
  <VoiceMini v-if="cardType === 'voice'" :att="audioAtt!" :time="timeLabel" />

  <!-- 标准卡：文字卡 1:1 方卡，图片 / 复合 3:4 竖卡，比例固定 -->
  <article
    v-else
    class="jot-card"
    :class="[cardType === 'text' ? 'jot-card-text' : 'jot-card-std', { 'opacity-60': note.deleted }]"
    @click="emit('open')"
  >
    <!-- 文字卡：彩底语录 -->
    <div v-if="cardType === 'text'" class="jot-textcard" :style="tcStyle">
      <p class="jot-tc-quote">
        <component v-if="note.pinned" :is="icons.Pin" :size="13" class="jot-icon-inline" />{{ title || '·' }}
      </p>
      <p v-if="body" class="jot-tc-sub">{{ body }}</p>
      <div v-if="metaVisible" class="jot-tc-foot">
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
        <span>{{ timeLabel }}</span>
      </div>
    </div>

    <!-- 图片卡：满幅封面，点图预览 -->
    <template v-else-if="cardType === 'image'">
      <div class="jot-imgcard" @click.stop="openPreview">
        <MediaPreview :att="imageAtts[0] ?? videoAtt" />
        <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
      </div>
      <div v-if="footVisible" class="jot-card-foot">
        <component v-if="note.pinned" :is="icons.Pin" :size="11" class="text-brand" />
        <span v-if="title" class="truncate">{{ title }}</span>
        <span class="flex-1" />
        <span>{{ timeLabel }}</span>
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
      </div>
    </template>

    <!-- 视频卡：海报封面 + 中央 ▶ + 左下时长角标，点封面全屏播放 -->
    <template v-else-if="cardType === 'video'">
      <div class="jot-imgcard" @click.stop="playVideo">
        <MediaPreview :att="imageAtts[0] ?? videoAtt" />
        <span class="jot-vid-play"><component :is="icons.Play" :size="18" /></span>
        <span v-if="vidBadge" class="jot-vid-dur">{{ vidBadge }}</span>
      </div>
      <div v-if="footVisible" class="jot-card-foot">
        <component v-if="note.pinned" :is="icons.Pin" :size="11" class="text-brand" />
        <span v-if="title" class="truncate">{{ title }}</span>
        <span class="flex-1" />
        <span>{{ timeLabel }}</span>
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
      </div>
    </template>

    <!-- 复合卡：上封面（图或视频海报）下文；无封面复合（语音+文字）退化为彩卡 + 迷你播放钮 -->
    <template v-else>
      <div
        v-if="hasCover" class="jot-comp-img"
        @click.stop="imageAtts.length ? openPreview() : playVideo()"
      >
        <MediaPreview :att="imageAtts[0] ?? videoAtt" />
        <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
        <template v-if="!imageAtts.length && videoAtt">
          <span class="jot-vid-play"><component :is="icons.Play" :size="18" /></span>
          <span v-if="vidBadge" class="jot-vid-dur">{{ vidBadge }}</span>
        </template>
        <button
          v-if="audioAtt"
          type="button" class="jot-comp-play cursor-pointer"
          :aria-label="compPlaying ? '暂停语音' : '播放语音'"
          @click.stop="compToggle"
        >
          <component :is="compPlaying ? icons.Pause : icons.Play" :size="13" />
        </button>
      </div>
      <template v-if="hasCover">
        <div class="jot-comp-body">
          <h3 class="jot-clamp-2 jot-fs-125 font-semibold leading-snug text-ink-0">
            <component v-if="note.pinned" :is="icons.Pin" :size="12" class="jot-icon-inline mr-0.5 inline-block text-brand" />{{ title }}
          </h3>
          <p v-if="body" class="jot-clamp-2 jot-fs-11 mt-0.5 text-ink-1">{{ body }}</p>
        </div>
        <div v-if="metaVisible" class="jot-card-foot">
          <span class="flex-1" />
          <span>{{ timeLabel }}</span>
          <span
            v-if="note.syncState !== 'synced'"
            class="h-1.5 w-1.5 rounded-full bg-warn"
            :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
          />
        </div>
      </template>
      <div v-else class="jot-textcard" :style="tcStyle">
        <p class="jot-tc-quote">{{ title || '语音笔记' }}</p>
        <p v-if="body" class="jot-tc-sub">{{ body }}</p>
        <button
          v-if="audioAtt"
          type="button" class="jot-comp-play cursor-pointer"
          :aria-label="compPlaying ? '暂停语音' : '播放语音'"
          :style="{ background: 'rgb(0 0 0 / 0.28)' }"
          @click.stop="compToggle"
        >
          <component :is="compPlaying ? icons.Pause : icons.Play" :size="13" />
        </button>
      </div>
    </template>

    <!-- 全屏图片预览 / 视频播放（共用查看器） -->
    <ImgViewer :src="preview" @close="previewAtt = null" @error="previewFailed" />
    <VideoViewer :src="playUrl" @close="videoSelection = null" @error="videoFailed" />
  </article>
</template>
