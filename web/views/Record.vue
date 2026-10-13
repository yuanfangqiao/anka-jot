<script setup lang="ts">
/** Record — 录音 + 实时转写（屏②录制态）。说完出字：interim 灰字、final 落段。 */
import { onUnmounted, ref } from 'vue'
import { useUi, toast, type Seg, type JotNote } from '../host'
import { JotRecorder } from '../lib/audio'
import { JotSpeech, speechSupported } from '../lib/speech'
import { pop } from '../lib/nav'
import { fmtDur } from '../lib/format'
import { attachAudio, newNote, saveDebounced, settings } from '../state/store'
import Waveform from '../components/Waveform.vue'

const props = defineProps<{ noteId?: string }>()
const emit = defineEmits<{ done: [noteId: string] }>()
const icons = useUi().icons

const recording = ref(false)
const seconds = ref(0)
const peaks = ref<number[]>([])
const segs = ref<Seg[]>([])
const interim = ref('')
const error = ref('')
const canSpeech = speechSupported()

let rec: JotRecorder | null = null
let sp: JotSpeech | null = null
let timer = 0
let realNoteId = props.noteId ?? ''

async function start() {
  error.value = ''
  try {
    rec = new JotRecorder()
    await rec.start()
    rec.onPeak = p => { peaks.value = p.slice(-240) }
    recording.value = true
    timer = window.setInterval(() => { seconds.value = rec?.elapsed() ?? 0 }, 250)
    if (canSpeech) {
      sp = new JotSpeech(settings.lang)
      sp.onSegment = (base, it) => { segs.value = base; interim.value = it }
      sp.start(0)
    }
  } catch (e: any) {
    error.value = '无法使用麦克风：' + (e?.message ?? '权限被拒绝')
    rec = null
  }
}

async function stop() {
  recording.value = false
  window.clearInterval(timer)
  const finalSegs = sp?.stop() ?? []
  const r = await rec?.stop().catch(() => null)
  rec = null; sp = null
  if (!r) return
  // 建笔记须等音频附件落库后再持久化，否则 persist 判「空笔记」跳过 → 整条丢失
  let fresh: JotNote | null = null
  if (!realNoteId) {
    const n = newNote('voice')
    realNoteId = n.id
    fresh = n
  }
  await attachAudio(realNoteId, r.blob, r.duration, r.peaks, finalSegs)
  if (fresh) saveDebounced(fresh, true)
  toast('语音笔记已保存')
  emit('done', realNoteId)
  pop()
}

onUnmounted(() => {
  window.clearInterval(timer)
  if (recording.value) { void rec?.stop().catch(() => {}) ; sp?.stop() }
})
</script>

<template>
  <div class="absolute inset-0 z-40 flex flex-col bg-bg-0 text-ink-0">
    <div class="flex items-center justify-between p-4">
      <button type="button" class="cursor-pointer rounded-full bg-glass p-2" @click="recording ? stop() : pop()">
        <component :is="icons.X" :size="18" />
      </button>
      <span class="text-[13px] text-ink-2">{{ canSpeech ? '实时转写中' : '仅录音（此浏览器不支持实时转写）' }}</span>
      <span class="w-9" />
    </div>

    <div class="flex flex-1 flex-col items-center justify-center gap-5 px-6">
      <p class="font-mono text-5xl font-light tracking-wider tabular-nums">{{ fmtDur(seconds) }}</p>
      <div class="w-full max-w-md">
        <Waveform :peaks="peaks" :live="recording" :height="64" />
      </div>
      <p v-if="error" class="max-w-sm text-center text-[12px] leading-5 text-err">{{ error }}</p>
    </div>

    <!-- 实时转写面板 -->
    <div v-if="segs.length || interim" class="max-h-[38%] overflow-y-auto rounded-t-shell bg-bg-1 p-5 shadow-card">
      <p class="mb-2 text-[11px] font-medium tracking-wide text-ink-2">实时转写</p>
      <p class="text-[14px] leading-6 text-ink-0">
        <span v-for="(s, i) in segs" :key="i">{{ s.text }} </span>
        <span class="text-ink-2">{{ interim }}</span>
      </p>
    </div>

    <div class="flex items-center justify-center gap-8 py-7">
      <span class="w-14" />
      <button
        type="button"
        class="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-full transition-transform active:scale-90"
        :class="recording ? 'bg-err' : 'bg-brand'"
        @click="recording ? stop() : start()"
      >
        <component :is="recording ? icons.Square : icons.Mic" :size="26" class="text-white" />
      </button>
      <span class="w-14 text-center text-[12px] text-ink-2">{{ recording ? '停止' : '开始' }}</span>
    </div>
  </div>
</template>
