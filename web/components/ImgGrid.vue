<script setup lang="ts">
/** ImgGrid — 图片附件九宫格 + 全屏查看器（复用共用 ImgViewer）。 */
import { onMounted, ref } from 'vue'
import { mediaUrl, useUi, type JotAtt } from '../host'
import * as db from '../lib/db'
import { backfillAtt } from '../lib/media'
import ImgViewer from './ImgViewer.vue'

const props = defineProps<{ atts: JotAtt[] }>()
const emit = defineEmits<{ ocr: [att: JotAtt] }>()
const icons = useUi().icons

const urls = ref<Record<string, string | null>>({})
const viewer = ref<string | null>(null)

onMounted(async () => {
  for (const a of props.atts) {
    const local = (await db.blobUrl(a.id + ':thumb')) ?? (await db.blobUrl(a.id))
    if (local) { urls.value[a.id] = local; continue }
    // LRU 淘汰/新设备：服务端缩略图兜底显示，顺手拉回本地缓存
    urls.value[a.id] = mediaUrl(a.thumbPath) ?? mediaUrl(a.serverPath)
    void backfillAtt(a, 'thumb')
  }
})

async function openFull(a: JotAtt) {
  viewer.value = (await db.blobUrl(a.id)) ?? mediaUrl(a.serverPath) ?? urls.value[a.id] ?? null
  if (viewer.value && !viewer.value.startsWith('blob:')) void backfillAtt(a) // 全图回填
}
</script>

<template>
  <div class="grid grid-cols-3 gap-1.5">
    <div v-for="a in atts" :key="a.id" class="group relative aspect-square overflow-hidden rounded-xl bg-bg-2">
      <img
        v-if="urls[a.id]" :src="urls[a.id]!" alt=""
        class="h-full w-full cursor-pointer object-cover transition-transform duration-micro group-active:scale-95"
        loading="lazy" @click="openFull(a)"
      />
      <div v-else class="flex h-full items-center justify-center text-ink-2">
        <component :is="icons.ImageOff" :size="18" />
      </div>
      <button
        type="button"
        class="absolute bottom-1 right-1 cursor-pointer rounded-full bg-black/55 px-2 py-0.5 jot-fs-10 text-white backdrop-blur"
        :class="{ 'animate-pulse-dot': a.pendingOcr }"
        @click.stop="emit('ocr', a)"
      >{{ a.ocrText ? 'OCR✓' : 'OCR' }}</button>
    </div>
  </div>

  <!-- 全屏查看器（共用组件） -->
  <ImgViewer :src="viewer" @close="viewer = null" />
</template>
