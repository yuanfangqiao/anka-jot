<script setup lang="ts">
/** ImgGrid — 图片附件九宫格 + 全屏查看器（复用共用 ImgViewer）。 */
import { ref } from 'vue'
import { useUi, type JotAtt } from '../host'
import { useMedia } from '../lib/useMedia'
import MediaPreview from './MediaPreview.vue'
import ImgViewer from './ImgViewer.vue'

defineProps<{ atts: JotAtt[] }>()
const emit = defineEmits<{ ocr: [att: JotAtt] }>()
const icons = useUi().icons

const selected = ref<JotAtt | null>(null)
const { src: viewer, failed } = useMedia(() => selected.value, true)
function openFull(a: JotAtt) { selected.value = a }
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-1.5">
      <div v-for="a in atts" :key="a.id" class="group relative aspect-square overflow-hidden rounded-xl bg-bg-2">
        <MediaPreview :att="a" @click="openFull(a)" />
        <button
          type="button"
          class="absolute bottom-1 right-1 cursor-pointer rounded-full bg-black/55 px-2 py-0.5 jot-fs-10 text-white backdrop-blur"
          :class="{ 'animate-pulse-dot': a.pendingOcr }"
          @click.stop="emit('ocr', a)"
        >{{ a.ocrText ? 'OCR✓' : 'OCR' }}</button>
      </div>
    </div>

    <!-- 全屏查看器（共用组件） -->
    <ImgViewer :src="viewer" @close="selected = null" @error="failed" />
  </div>
</template>
