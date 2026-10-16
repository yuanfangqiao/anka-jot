<script setup lang="ts">
/** VideoCard — 详情页视频附件块：16:9 海报 + ▶ 徽章 + 时长角标，点击全屏播放。 */
import { computed, ref } from 'vue'
import { useUi, type JotAtt } from '../host'
import { useMedia } from '../lib/useMedia'
import MediaPreview from './MediaPreview.vue'
import { fmtBytes, fmtDur } from '../lib/format'
import VideoViewer from './VideoViewer.vue'

const props = defineProps<{ att: JotAtt }>()
const icons = useUi().icons

const playing = ref(false)
const { src: playUrl, failed } = useMedia(() => playing.value ? props.att : null, true)
/** 右下角角标：时长 · 大小（旧数据无 size 时只显时长） */
const badge = computed(() => {
  const parts: string[] = []
  if (props.att.duration) parts.push(fmtDur(props.att.duration))
  if (props.att.size) parts.push(fmtBytes(props.att.size))
  return parts.join(' · ')
})

</script>

<template>
  <div class="jot-videocard" role="button" aria-label="播放视频" @click="playing = true">
    <MediaPreview :att="att" />
    <span class="jot-vid-play"><component :is="icons.Play" :size="20" /></span>
    <span v-if="badge" class="jot-vid-dur">{{ badge }}</span>
    <VideoViewer :src="playUrl" @close="playing = false" @error="failed" />
  </div>
</template>
