<script setup lang="ts">
/** ImgGrid — 图片附件九宫格 + 全屏查看器。 */
import { onMounted, onUnmounted, ref } from 'vue'
import { mediaUrl, useUi, type JotAtt } from '../host'
import * as db from '../lib/db'

const props = defineProps<{ atts: JotAtt[] }>()
const emit = defineEmits<{ ocr: [att: JotAtt] }>()
const icons = useUi().icons

const urls = ref<Record<string, string | null>>({})
const viewer = ref<string | null>(null)

onMounted(async () => {
  for (const a of props.atts) {
    urls.value[a.id] = (await db.blobUrl(a.id + ':thumb')) ?? (await db.blobUrl(a.id))
      ?? mediaUrl(a.thumbPath) ?? mediaUrl(a.serverPath)
  }
})

async function openFull(a: JotAtt) {
  viewer.value = (await db.blobUrl(a.id)) ?? mediaUrl(a.serverPath) ?? urls.value[a.id] ?? null
}

// Esc 关闭全屏查看器
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') viewer.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
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

  <!-- 全屏查看器 -->
  <Teleport to="body">
    <div
      v-if="viewer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      @click="viewer = null"
    >
      <img :src="viewer" class="max-h-full max-w-full rounded-lg object-contain" alt="图片预览" />
      <button
        type="button"
        class="absolute right-4 top-4 cursor-pointer rounded-full bg-white/15 p-2 text-white backdrop-blur"
        aria-label="关闭预览" title="关闭预览"
        @click.stop="viewer = null"
      >
        <component :is="icons.X" :size="18" />
      </button>
    </div>
  </Teleport>
</template>
