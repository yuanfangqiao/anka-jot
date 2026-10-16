<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useUi, type JotAtt } from '../host'
import { useMedia } from '../lib/useMedia'
const props = defineProps<{ att?: JotAtt | null }>()
const icons = useUi().icons
const container = ref<HTMLElement | null>(null)
const visible = ref(false)
let observer: IntersectionObserver | null = null
onMounted(() => {
  if (!('IntersectionObserver' in window)) { visible.value = true; return }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      visible.value = true
      observer?.disconnect()
    }
  }, { rootMargin: '240px' })
  if (container.value) observer.observe(container.value)
})
onUnmounted(() => observer?.disconnect())
const { src, loading, failed, loaded } = useMedia(() => visible.value ? props.att : null)
</script>

<template>
  <div ref="container" class="jot-media-preview">
    <img v-if="src" :src="src" alt="" loading="lazy" @error="failed" @load="loaded" />
    <div v-else class="jot-cover-missing">
      <component :is="att?.kind === 'video' ? icons.Film : icons.ImageOff" :size="20" />
      <span>{{ !visible || loading ? '加载中…' : '封面暂不可用，点击查看' }}</span>
    </div>
  </div>
</template>
