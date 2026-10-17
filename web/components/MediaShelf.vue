<script setup lang="ts">
/** MediaShelf — 详情页附件横滑缩略条（小红书式）：
 *  图片/视频统一 3:4 缩略，语音为深色瓷贴（播放钮 + 时长 + 进度）。
 *  点图/视频全屏预览；语音就地播放，切歌自动停上一段。 */
import { onUnmounted, ref } from 'vue'
import { mediaUrl, toast, useUi, type JotAtt } from '../host'
import { useMedia } from '../lib/useMedia'
import * as db from '../lib/db'
import { backfillAtt } from '../lib/media'
import { fmtDur } from '../lib/format'
import MediaPreview from './MediaPreview.vue'
import ImgViewer from './ImgViewer.vue'
import VideoViewer from './VideoViewer.vue'

defineProps<{ atts: JotAtt[] }>()
const emit = defineEmits<{ ocr: [att: JotAtt] }>()
const icons = useUi().icons

// 全屏查看器（同一时刻只用其一）
const zoom = ref<JotAtt | null>(null)
const { src: zoomSrc, failed: zoomFailed } = useMedia(() => zoom.value, true)
const playVideo = ref<JotAtt | null>(null)
const { src: videoSrc, failed: videoFailed } = useMedia(() => playVideo.value, true)

// ─── 语音：单实例播放器，切歌释放上一段 ──
const playingId = ref('')
const progress = ref<Record<string, number>>({})
let el: HTMLAudioElement | null = null

async function toggleAudio(a: JotAtt) {
  if (playingId.value === a.id) { el?.pause(); return }
  el?.pause()
  el = null
  const url = (await db.blobUrl(a.id)) ?? mediaUrl(a.serverPath)
  if (!url) { toast('音频尚未同步到本机', false); return }
  if (!url.startsWith('blob:')) void backfillAtt(a)
  el = new Audio(url)
  el.ontimeupdate = () => {
    if (el) progress.value = { ...progress.value, [a.id]: el.duration ? el.currentTime / el.duration : 0 }
  }
  el.onended = () => { playingId.value = ''; progress.value = { ...progress.value, [a.id]: 0 } }
  el.onpause = () => { if (playingId.value === a.id) playingId.value = '' }
  el.onplay = () => { playingId.value = a.id }
  el.onerror = () => { playingId.value = ''; toast('音频加载失败', false) }
  try {
    await el.play()
  } catch {
    playingId.value = ''
    toast('音频播放失败', false)
  }
}

onUnmounted(() => { el?.pause(); el = null })

/** 点击分派：语音就地播放，视频/图片进全屏查看器 */
function openAtt(a: JotAtt) {
  if (a.kind === 'audio') void toggleAudio(a)
  else if (a.kind === 'video') playVideo.value = a
  else zoom.value = a
}
</script>

<template>
  <div class="jot-mshelf" role="list">
    <button
      v-for="a in atts" :key="a.id" type="button" role="listitem"
      class="jot-mshelf-item"
      :class="{ 'jot-mshelf-audio': a.kind === 'audio' }"
      :aria-label="a.kind === 'audio' ? (playingId === a.id ? '暂停语音' : '播放语音') : '查看附件'"
      @click="openAtt(a)"
    >
      <template v-if="a.kind === 'audio'">
        <span class="jot-mshelf-play">
          <span><component :is="playingId === a.id ? icons.Pause : icons.Play" :size="15" /></span>
        </span>
        <span class="jot-mshelf-audio-meta">
          <component :is="icons.Mic" :size="11" />{{ fmtDur(a.duration) }}
        </span>
        <span class="jot-mshelf-progress"><i :style="{ width: `${(progress[a.id] ?? 0) * 100}%` }" /></span>
      </template>

      <template v-else>
        <MediaPreview :att="a" />
        <span v-if="a.kind === 'video'" class="jot-mshelf-play">
          <span><component :is="icons.Play" :size="15" /></span>
        </span>
        <span v-if="a.kind === 'video' && a.duration" class="jot-mshelf-badge">{{ fmtDur(a.duration) }}</span>
        <span
          v-if="a.kind === 'image'" class="jot-mshelf-badge is-ocr"
          :class="{ 'is-done': a.ocrText, 'animate-pulse-dot': a.pendingOcr }"
          @click.stop="emit('ocr', a)"
        >{{ a.ocrText ? 'OCR✓' : 'OCR' }}</span>
      </template>
    </button>

    <ImgViewer :src="zoomSrc" @close="zoom = null" @error="zoomFailed" />
    <VideoViewer :src="videoSrc" @close="playVideo = null" @error="videoFailed" />
  </div>
</template>
