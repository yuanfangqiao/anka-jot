<script setup lang="ts">
/** OfflineBanner — 「离线模式 · 已本地保存 / N 项待同步」（设计稿屏⑥）。
 *  手动同步带结果反馈；失败原因直接展示，不再沉默。 */
import { computed } from 'vue'
import { toast, useUi } from '../host'
import { syncNow, syncState } from '../lib/sync'

const icons = useUi().icons

const show = computed(() => !syncState.online || syncState.pending > 0 || syncState.backendUp === false)
const text = computed(() => {
  if (syncState.backendUp === false && syncState.online) return '后端未就绪 · 仅本地保存'
  if (!syncState.online) return `离线模式 · 已本地保存${syncState.pending ? ` · ${syncState.pending} 项待同步` : ''}`
  return `${syncState.pending} 项待同步`
})
const ok = computed(() => syncState.online && syncState.pending === 0 && syncState.backendUp !== false)

/** 主动同步：结束后给出明确结果（成功 / 失败原因） */
async function manualSync() {
  await syncNow()
  if (syncState.pending === 0 && syncState.backendUp !== false) {
    toast('已全部同步 ✓')
  } else {
    toast(syncState.lastError || '同步未完成，将在后台自动重试', false)
  }
}
</script>

<template>
  <div
    v-if="show"
    class="flex items-center gap-2 rounded-xl px-3 py-2 jot-fs-12 font-medium"
    :class="ok ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'"
  >
    <component :is="syncState.online ? icons.CloudUpload : icons.CloudOff" :size="14" class="shrink-0" />
    <div class="min-w-0 flex-1">
      <p>{{ text }}</p>
      <p v-if="syncState.lastError && !ok" class="jot-fs-10 truncate opacity-75" :title="syncState.lastError">
        {{ syncState.lastError }}
      </p>
    </div>
    <button
      v-if="syncState.online && (syncState.pending > 0 || syncState.backendUp === false)"
      type="button"
      class="shrink-0 cursor-pointer rounded-lg bg-warn/20 px-2 py-1 jot-fs-11 transition-transform active:scale-95"
      :disabled="syncState.syncing"
      @click="manualSync"
    >{{ syncState.syncing ? '同步中…' : '同步' }}</button>
  </div>
</template>
