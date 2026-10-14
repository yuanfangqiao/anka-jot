<script setup lang="ts">
/** Record — 录音（屏②录制态）。纯录音：计时 + 实时波形。
 *  实时转写已移除（iOS 独立 Web App 中 SpeechRecognition 会抢占音频会话导致录音无声）。 */
import { onUnmounted, ref } from 'vue'
import { useUi, toast, type JotNote } from '../host'
import { JotRecorder } from '../lib/audio'
import { needsInstallHint } from '../lib/platform'
import * as db from '../lib/db'
import { pop } from '../lib/nav'
import { fmtDur } from '../lib/format'
import { attachAudio, newNote, saveDebounced } from '../state/store'
import Waveform from '../components/Waveform.vue'

const props = defineProps<{ noteId?: string }>()
const emit = defineEmits<{ done: [noteId: string] }>()
const icons = useUi().icons

const recording = ref(false)
const seconds = ref(0)
const peaks = ref<number[]>([])
const error = ref('')

let rec: JotRecorder | null = null
let timer = 0
let realNoteId = props.noteId ?? ''

/** iOS 非安装态：授权为会话级，提示一次「安装到主屏后只问一次」 */
async function hintInstallOnce() {
  if (!needsInstallHint()) return
  try {
    if (await db.kvGet<boolean>('iosInstallHinted')) return
    await db.kvSet('iosInstallHinted', true)
    toast('提示：Safari 分享 → 添加到主屏幕，麦克风就只需授权一次')
  } catch { /* 提示失败不影响录音 */ }
}

async function start() {
  error.value = ''
  void hintInstallOnce()
  try {
    rec = new JotRecorder()
    await rec.start()
    rec.onPeak = p => { peaks.value = p.slice(-240) }
    recording.value = true
    timer = window.setInterval(() => { seconds.value = rec?.elapsed() ?? 0 }, 250)
  } catch (e: any) {
    // 透出具体错误（iOS 二次录音失败等场景可诊断），不再吞掉错误名
    const detail = [e?.name, e?.message].filter(Boolean).join(' ')
    error.value = '无法使用麦克风：' + (detail || '权限被拒绝')
    rec = null
  }
}

async function stop() {
  recording.value = false
  window.clearInterval(timer)
  const r = await rec?.stop().catch(() => null)
  rec = null
  if (!r) return
  // 建笔记须等音频附件落库后再持久化，否则 persist 判「空笔记」跳过 → 整条丢失
  let fresh: JotNote | null = null
  if (!realNoteId) {
    const n = newNote('voice')
    realNoteId = n.id
    fresh = n
  }
  await attachAudio(realNoteId, r.blob, r.duration, r.peaks, [])
  if (fresh) saveDebounced(fresh, true)
  toast('语音笔记已保存')
  emit('done', realNoteId)
  pop()
}

onUnmounted(() => {
  window.clearInterval(timer)
  if (recording.value) void rec?.stop().catch(() => {})
})
</script>

<template>
  <div class="absolute inset-0 z-40 flex flex-col bg-bg-0 text-ink-0">
    <div class="flex items-center justify-between p-4">
      <button type="button" class="cursor-pointer rounded-full bg-glass p-2" @click="recording ? stop() : pop()">
        <component :is="icons.X" :size="18" />
      </button>
      <span class="jot-fs-13 text-ink-2">{{ recording ? '录音中' : '语音录制' }}</span>
      <span class="w-9" />
    </div>

    <div class="flex flex-1 flex-col items-center justify-center gap-5 px-6">
      <p class="font-mono text-5xl font-light tracking-wider tabular-nums">{{ fmtDur(seconds) }}</p>
      <div class="w-full max-w-md">
        <Waveform :peaks="peaks" :live="recording" :height="64" />
      </div>
      <p v-if="error" class="max-w-sm text-center jot-fs-12 leading-5 text-err">{{ error }}</p>
    </div>

    <div class="flex items-center justify-center gap-8 py-7">
      <span class="w-14" />
      <button
        type="button"
        class="jot-rec-btn"
        :class="recording ? 'bg-err' : 'bg-brand'"
        @click="recording ? stop() : start()"
      >
        <component :is="recording ? icons.Square : icons.Mic" :size="26" class="text-white" />
      </button>
      <span class="w-14 text-center jot-fs-12 text-ink-2">{{ recording ? '停止' : '开始' }}</span>
    </div>
  </div>
</template>
