<script setup lang="ts">
/** NoteCard — 小红书瀑布流竖卡：封面图自然高度 + 标题/摘要 + 底部来源与时间。 */
import { computed, onMounted, ref } from 'vue'
import { useUi, type JotAtt, type JotNote } from '../host'
import { coverOf, hasAudio } from '../state/store'
import { dayLabel, fmtClock, fmtDur } from '../lib/format'

const props = withDefaults(defineProps<{
  note: JotNote
  tagColors?: Record<string, string | null>
  /** 时间线按天分组时组头已显示日期，卡片内隐藏避免重复 */
  showDay?: boolean
}>(), { showDay: true })
const emit = defineEmits<{ open: [] }>()
const icons = useUi().icons

const cover = ref<string | null>(null)
/** 封面加载失败（媒体尚未同步到本机）→ 显示渐变占位 */
const coverBroken = ref(false)
onMounted(async () => { cover.value = await coverOf(props.note.id) })

const SRC_ICON: Record<string, string> = {
  text: 'Type', camera: 'Camera', album: 'Images', voice: 'Mic', share: 'Share2',
}
const SRC_HUE: Record<string, string> = {
  text: '#5E9B74', camera: '#E0A53E', album: '#6B8FC4', voice: '#8B7BD8', share: '#5FA8A0',
}

/** 首个音频附件（含无 peaks 的老录音） */
const audioAtt = computed<JotAtt | null>(() =>
  props.note.atts?.find(x => x.kind === 'audio') ?? null)

/** 语音气泡波形：无 peaks 的老录音用静态装饰波形占位（不再渲染空洞卡片） */
const PLACEHOLDER = [0.32, 0.55, 0.78, 0.5, 0.9, 0.62, 0.4, 0.7, 0.45, 0.85, 0.58, 0.36, 0.66, 0.48, 0.74, 0.42, 0.6, 0.3]
const voicePeaks = computed(() => {
  const a = audioAtt.value
  if (!a) return null
  const src = a.peaks?.length ? a.peaks : PLACEHOLDER
  const out: number[] = []
  for (let i = 0; i < 26; i++) out.push(src[Math.floor(i / 26 * src.length)] ?? 0.05)
  return out
})

function excerpt(n: JotNote): string {
  const t = (n.text || '').replace(/^#+\s*/gm, '').replace(/[-*] \[[ x]\] /g, '☐ ').trim()
  return t.slice(0, 120) || (hasAudio(n.atts) ? '语音笔记' : '')
}

const title = computed(() => props.note.title || excerpt(props.note).split('\n')[0] || '未命名')
const body = computed(() => {
  const t = excerpt(props.note)
  // 标题已占用首行时，正文去掉重复首行
  return props.note.title ? t : t.split('\n').slice(1).join(' ').trim()
})
</script>

<template>
  <article
    class="jot-card"
    :class="{ 'opacity-60': note.deleted }"
    @click="emit('open')"
  >
    <!-- 封面：图片自然高度，形成瀑布流感；加载失败（媒体未同步到本机）显示渐变占位 -->
    <img
      v-if="cover && !coverBroken"
      :src="cover" alt="" class="w-full" loading="lazy"
      @error="coverBroken = true"
    />
    <div v-else-if="cover && coverBroken" class="jot-cover-missing">
      <component :is="icons.ImageOff" :size="20" />
      <span>图片同步中…</span>
    </div>

    <div class="p-2.5">
      <h3 class="jot-clamp-2 jot-fs-135 font-semibold leading-snug text-ink-0">
        <component v-if="note.pinned" :is="icons.Pin" :size="12" class="jot-icon-inline mr-0.5 inline-block text-brand" />{{ title }}
      </h3>

      <!-- 语音气泡（播放钮 + 波形 + 时长）；无音频时退化为摘要文字 -->
      <div v-if="voicePeaks" class="jot-voicebar">
        <span class="jot-voicebar-play">
          <component :is="icons.Play" :size="12" />
        </span>
        <span class="jot-voicebar-wave">
          <span
            v-for="(p, i) in voicePeaks" :key="i"
            class="jot-voicebar-bar"
            :style="{ height: Math.max(3, p * 20) + 'px', opacity: 0.35 + p * 0.6 }"
          />
        </span>
        <span class="jot-voicebar-dur">{{ fmtDur(audioAtt?.duration) }}</span>
      </div>
      <p
        v-if="body"
        class="jot-fs-12 jot-leading-145 mt-1 text-ink-1"
        :class="cover ? 'jot-clamp-2' : 'jot-clamp-5'"
      >{{ body }}</p>

      <!-- 底部：来源 + 时间 -->
      <div class="mt-2 flex items-center gap-1 text-ink-2">
        <component :is="icons[SRC_ICON[note.source] ?? 'Type']" :size="11" :style="{ color: SRC_HUE[note.source] }" />
        <span class="jot-fs-10">{{ showDay ? dayLabel(note.createdAt) + ' ' : '' }}{{ fmtClock(note.createdAt) }}</span>
        <span class="flex-1" />
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
      </div>
    </div>
  </article>
</template>
