<script setup lang="ts">
/** AudioCard — 音频附件卡：播放/暂停 + 波形进度 + 时长。 */
import { onUnmounted, ref } from 'vue'
import { mediaUrl, toast, useUi, type JotAtt } from '../host'
import * as db from '../lib/db'
import { fmtDur } from '../lib/format'
import Waveform from './Waveform.vue'

const props = defineProps<{ att: JotAtt }>()
const icons = useUi().icons

const playing = ref(false)
const progress = ref(0)
const cur = ref(0)
let el: HTMLAudioElement | null = null

async function toggle() {
  if (playing.value) { el?.pause(); return }
  if (!el) {
    const url = (await db.blobUrl(props.att.id)) ?? mediaUrl(props.att.serverPath)
    if (!url) return
    el = new Audio(url)
    el.ontimeupdate = () => {
      cur.value = el!.currentTime
      progress.value = props.att.duration ? el!.currentTime / props.att.duration : 0
    }
    el.onended = () => { playing.value = false; progress.value = 0; cur.value = 0 }
    el.onpause = () => { playing.value = false }
    el.onplay = () => { playing.value = true }
    el.onerror = () => { playing.value = false; toast('音频加载失败', false) }
  }
  try {
    await el.play()
  } catch {
    playing.value = false
    toast('音频播放失败', false)
  }
}

onUnmounted(() => { el?.pause(); el = null })
</script>

<template>
  <div class="flex items-center gap-3 rounded-card bg-bg-2 p-3">
    <button
      type="button"
      class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition-transform active:scale-90"
      :aria-label="playing ? '暂停' : '播放语音'"
      @click="toggle"
    >
      <component :is="playing ? icons.Pause : icons.Play" :size="18" />
    </button>
    <div class="min-w-0 flex-1">
      <Waveform :peaks="att.peaks ?? []" :progress="progress" :height="34" />
      <div class="mt-1 flex justify-between jot-fs-11 text-ink-2">
        <span>{{ fmtDur(cur) }}</span>
        <span>{{ fmtDur(att.duration) }}</span>
      </div>
    </div>
  </div>
</template>
