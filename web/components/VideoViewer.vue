<script setup lang="ts">
/** VideoViewer — 共用全屏视频播放器（Teleport 黑底；点空白 / Esc / × 关闭）。
 *  与 ImgViewer 同交互；视频区点击不冒泡（避免误关），交给原生 controls。 */
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
      role="dialog" aria-modal="true" aria-label="视频播放"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      @click="emit('close')"
    >
      <video
        :src="src" @error="emit('error')" class="max-h-full max-w-full" controls autoplay playsinline preload="metadata"
        @click.stop
      />
      <button
        type="button"
        class="absolute right-4 top-4 cursor-pointer rounded-full bg-white/15 p-2 text-white backdrop-blur"
        aria-label="关闭播放" title="关闭播放"
        @click.stop="emit('close')"
      >
        <component :is="icons.X" :size="18" />
      </button>
    </div>
  </Teleport>
</template>
