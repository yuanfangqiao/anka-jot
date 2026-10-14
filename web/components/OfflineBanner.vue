<script setup lang="ts">
/** OfflineBanner — 「离线模式 · 已本地保存 / N 项待同步」（设计稿屏⑥）。 */
import { computed } from 'vue'
import { useUi } from '../host'
import { syncNow, syncState } from '../lib/sync'

const icons = useUi().icons

const show = computed(() => !syncState.online || syncState.pending > 0 || syncState.backendUp === false)
const text = computed(() => {
  if (syncState.backendUp === false && syncState.online) return '后端未就绪 · 仅本地保存'
  if (!syncState.online) return `离线模式 · 已本地保存${syncState.pending ? ` · ${syncState.pending} 项待同步` : ''}`
  return `${syncState.pending} 项待同步`
})
const ok = computed(() => syncState.online && syncState.pending === 0 && syncState.backendUp !== false)
</script>

<template>
  <div
    v-if="show"
    class="flex items-center gap-2 rounded-xl px-3 py-2 jot-fs-12 font-medium"
    :class="ok ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'"
  >
    <component :is="syncState.online ? icons.CloudUpload : icons.CloudOff" :size="14" />
    <span class="flex-1">{{ text }}</span>
    <button
      v-if="syncState.online && syncState.pending > 0"
      type="button"
      class="cursor-pointer rounded-lg bg-warn/20 px-2 py-1 jot-fs-11 transition-transform active:scale-95"
      :disabled="syncState.syncing"
      @click="syncNow"
    >{{ syncState.syncing ? '同步中…' : '同步' }}</button>
  </div>
</template>
