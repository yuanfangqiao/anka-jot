<script setup lang="ts">
/** TagChip — 彩色标签 chip。 */
defineProps<{ name: string; color?: string | null; removable?: boolean; active?: boolean }>()
const emit = defineEmits<{ remove: []; click: [] }>()
</script>

<template>
  <button
    type="button"
    class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 jot-fs-115 font-medium transition-all duration-micro active:scale-95"
    :style="{
      background: (color ?? '#8B7BD8') + (active ? '33' : '1c'),
      color: color ?? '#8B7BD8',
      boxShadow: active ? `inset 0 0 0 1px ${color ?? '#8B7BD8'}` : 'none',
    }"
    @click="emit('click')"
  >
    <span class="inline-block h-1.5 w-1.5 rounded-full" :style="{ background: color ?? '#8B7BD8' }" />
    {{ name }}
    <span
      v-if="removable"
      role="button" tabindex="0" aria-label="移除标签" class="ml-0.5 opacity-70"
      @click.stop="emit('remove')"
      @keydown.enter.prevent.stop="emit('remove')"
      @keydown.space.prevent.stop="emit('remove')"
    >×</span>
  </button>
</template>
