<script setup lang="ts">
/** ImgViewer — 共用全屏图片查看器（Teleport 黑底；点空白 / Esc / × 关闭）。
 *  从 ImgGrid 抽取，供 NoteCard 图片区点击直接预览复用。 */
import { onUnmounted, watch } from 'vue'
import { useUi } from '../host'
import { useBack } from '../lib/useBack'

const props = defineProps<{ src: string | null }>()
const emit = defineEmits<{ close: []; error: [] }>()
const icons = useUi().icons
useBack(() => Boolean(props.src), () => emit('close'))

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
watch(() => props.src, (v) => {
  if (v) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="src"
      role="dialog" aria-modal="true" aria-label="图片预览"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      @click="emit('close')"
    >
      <img @error="emit('error')" :src="src" class="max-h-full max-w-full rounded-lg object-contain" alt="图片预览" />
      <button
        type="button"
        class="absolute right-4 top-4 cursor-pointer rounded-full bg-white/15 p-2 text-white backdrop-blur"
        aria-label="关闭预览" title="关闭预览"
        @click.stop="emit('close')"
      >
        <component :is="icons.X" :size="18" />
      </button>
    </div>
  </Teleport>
</template>
