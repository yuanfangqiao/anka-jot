<script setup lang="ts">
import { useUi, type JotAtt } from '../host'
import { useMedia } from '../lib/useMedia'
const props = defineProps<{ att?: JotAtt | null }>()
const icons = useUi().icons
const { src, video, loading, failed, loaded } = useMedia(() => props.att)
</script>

<template>
  <div class="jot-media-preview">
    <video v-if="src && video" :src="src" muted playsinline preload="metadata" @error="failed" />
    <img v-else-if="src" :src="src" alt="" loading="lazy" @error="failed" @load="loaded" />
    <div v-else class="jot-cover-missing">
      <component :is="att?.kind === 'video' ? icons.Film : icons.ImageOff" :size="20" />
      <span>{{ loading ? '加载中…' : '暂时无法加载，下拉重试' }}</span>
    </div>
  </div>
</template>
