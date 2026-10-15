<script setup lang="ts">
/** NoteCard — 主页时间线卡片：按内容分四类，尺寸固定、内容即类型。
 *  文字卡 = 哈希取色语录卡（1:1 方卡，无标题时正文即标题）；图片卡 = 满幅封面（3:4，点图全屏预览）；
 *  语音卡 = 64px 矮条语音条（整条点击播放/暂停）；复合卡 = 3:4 上图下文（图区点预览、文区进详情）。 */
import { computed, onMounted, ref } from 'vue'
import { mediaUrl, useUi, type JotAtt, type JotNote } from '../host'
import { coverOf } from '../state/store'
import * as db from '../lib/db'
import { dayLabel, fmtClock } from '../lib/format'
import { hashCardColor } from '../lib/color'
import { useAudioPlayer } from '../lib/useAudioPlayer'
import ImgViewer from './ImgViewer.vue'
import VoiceMini from './VoiceMini.vue'

const props = withDefaults(defineProps<{
  note: JotNote
  tagColors?: Record<string, string | null>
  /** 时间线按天分组时组头已显示日期，卡片内隐藏避免重复 */
  showDay?: boolean
}>(), { showDay: true })
const emit = defineEmits<{ open: [] }>()
const icons = useUi().icons

type CardType = 'text' | 'image' | 'voice' | 'composite'

const imageAtts = computed<JotAtt[]>(() => props.note.atts?.filter(a => a.kind === 'image') ?? [])
const audioAtt = computed<JotAtt | null>(() => props.note.atts?.find(a => a.kind === 'audio') ?? null)

/** 正文（剥 markdown 标记） */
const text = computed(() =>
  (props.note.text || '').replace(/^#+\s*/gm, '').replace(/[-*] \[[ x]\] /g, '☐ ').trim())

/** 卡片类型判定：纯语音 / 纯图片 / 纯文字 / 其余一律复合 */
const cardType = computed<CardType>(() => {
  const hasImg = imageAtts.value.length > 0
  const hasAud = Boolean(audioAtt.value)
  const hasTxt = text.value.length > 0
  if (hasAud && !hasImg && !hasTxt) return 'voice'
  if (hasImg && !hasTxt && !hasAud) return 'image'
  if (!hasImg && !hasAud) return 'text'
  return 'composite'
})

/** 标题：无标题时取正文首行（文字卡直接以正文为主角，不再出现「未命名」） */
const title = computed(() => props.note.title || text.value.split('\n')[0] || '')
const body = computed(() =>
  props.note.title ? text.value : text.value.split('\n').slice(1).join(' ').trim())

/** 文字彩卡底色：首字哈希取色（确定性，同一笔记永远同色） */
const tcStyle = computed(() => hashCardColor(props.note.title || text.value))

/** 封面（仅图片卡/复合卡需要） */
const cover = ref<string | null>(null)
const coverBroken = ref(false)
onMounted(async () => {
  if (cardType.value === 'image' || cardType.value === 'composite')
    cover.value = await coverOf(props.note.id)
})

/** 点击图片区 → 全屏预览（全图 blob 优先，服务端路径兜底） */
const preview = ref<string | null>(null)
async function openPreview() {
  const a = imageAtts.value[0]
  if (!a) return
  preview.value = (await db.blobUrl(a.id)) ?? mediaUrl(a.serverPath) ?? cover.value
}

/** 复合卡迷你播放钮（与语音小卡同源播放逻辑） */
const { playing: compPlaying, toggle: compToggle } = useAudioPlayer(() => audioAtt.value)

const timeLabel = computed(() =>
  (props.showDay ? dayLabel(props.note.createdAt) + ' ' : '') + fmtClock(props.note.createdAt))
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
      <div class="jot-tc-foot">
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
        <img
          v-if="cover && !coverBroken"
          :src="cover" alt="" loading="lazy"
          @error="coverBroken = true"
        />
        <div v-else class="jot-cover-missing">
          <component :is="icons.ImageOff" :size="20" />
          <span>图片同步中…</span>
        </div>
        <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
      </div>
      <div class="jot-card-foot">
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

    <!-- 复合卡：上图下文；无图复合（语音+文字）退化为彩卡 + 迷你播放钮 -->
    <template v-else>
      <div v-if="imageAtts.length" class="jot-comp-img" @click.stop="openPreview">
        <img
          v-if="cover && !coverBroken"
          :src="cover" alt="" loading="lazy"
          @error="coverBroken = true"
        />
        <div v-else class="jot-cover-missing">
          <component :is="icons.ImageOff" :size="20" />
          <span>图片同步中…</span>
        </div>
        <span v-if="imageAtts.length > 1" class="jot-imgbadge">{{ imageAtts.length }}张</span>
        <button
          v-if="audioAtt"
          type="button" class="jot-comp-play cursor-pointer"
          :aria-label="compPlaying ? '暂停语音' : '播放语音'"
          @click.stop="compToggle"
        >
          <component :is="compPlaying ? icons.Pause : icons.Play" :size="13" />
        </button>
      </div>
      <div v-if="imageAtts.length" class="jot-comp-body">
        <h3 class="jot-clamp-2 jot-fs-125 font-semibold leading-snug text-ink-0">
          <component v-if="note.pinned" :is="icons.Pin" :size="12" class="jot-icon-inline mr-0.5 inline-block text-brand" />{{ title }}
        </h3>
        <p v-if="body" class="jot-clamp-2 jot-fs-11 mt-0.5 text-ink-1">{{ body }}</p>
      </div>
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
      <div v-if="imageAtts.length" class="jot-card-foot">
        <span class="flex-1" />
        <span>{{ timeLabel }}</span>
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
      </div>
    </template>

    <!-- 全屏图片预览（共用查看器） -->
    <ImgViewer :src="preview" @close="preview = null" />
  </article>
</template>
