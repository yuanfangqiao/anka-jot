<script setup lang="ts">
/** Empty — 空态。 */
import { useUi } from '../host'

withDefaults(defineProps<{ icon?: string; title: string; hint?: string }>(), { icon: 'Sparkles' })
const icons = useUi().icons
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <component :is="icons[icon] ?? icons.Sparkles" :size="36" class="text-ink-2 opacity-60" />
    <p class="text-[14px] font-medium text-ink-1">{{ title }}</p>
    <p v-if="hint" class="max-w-60 text-[12px] leading-5 text-ink-2">{{ hint }}</p>
  </div>
</template>
