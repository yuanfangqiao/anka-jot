<script setup lang="ts">
/** VideoCard — 详情页视频附件块：16:9 海报 + ▶ 徽章 + 时长角标，点击全屏播放。 */
import { onMounted, ref } from 'vue'
import { mediaUrl, useUi, type JotAtt } from '../host'
import * as db from '../lib/db'
import { fmtDur } from '../lib/format'
import VideoViewer from './VideoViewer.vue'

const props = defineProps<{ att: JotAtt }>()
const icons = useUi().icons

const poster = ref<string | null>(null)
const playUrl = ref<string | null>(null)
onMounted(async () => {
  poster.value = (await db.blobUrl(props.att.id + ':thumb')) ?? mediaUrl(props.att.thumbPath)
})

/** 点击 → 全屏播放（本地 blob 优先，服务端路径兜底） */
async function play() {
  playUrl.value = (await db.blobUrl(props.att.id)) ?? mediaUrl(props.att.serverPath)
}
</script>

<template>
  <div class="jot-videocard" role="button" aria-label="播放视频" @click="play">
    <img v-if="poster" :src="poster" alt="" loading="lazy" />
    <span class="jot-vid-play"><component :is="icons.Play" :size="20" /></span>
    <span v-if="att.duration" class="jot-vid-dur">{{ fmtDur(att.duration) }}</span>
    <VideoViewer :src="playUrl" @close="playUrl = null" />
  </div>
</template>
