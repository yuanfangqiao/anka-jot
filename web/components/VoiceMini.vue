<script setup lang="ts">
/** VoiceMini — 主页语音小卡（约 64px 矮条语音条）：
 *  整条点击 = 播放/暂停预览（波形随进度点亮），时间戳在右下角。 */
import { computed } from 'vue'
import { useUi, type JotAtt } from '../host'
import { fmtDur } from '../lib/format'
import { useAudioPlayer } from '../lib/useAudioPlayer'

const props = defineProps<{ att: JotAtt; time?: string }>()
const icons = useUi().icons

const { playing, progress, toggle } = useAudioPlayer(() => props.att)

/** 无 peaks 的老录音用静态装饰波形占位 */
const PLACEHOLDER = [0.32, 0.55, 0.78, 0.5, 0.9, 0.62, 0.4, 0.7, 0.45, 0.85, 0.58, 0.36, 0.66, 0.48, 0.74, 0.42, 0.6, 0.3]
const bars = computed(() => {
  const src = props.att.peaks?.length ? props.att.peaks : PLACEHOLDER
  const out: number[] = []
  for (let i = 0; i < 26; i++) out.push(src[Math.floor(i / 26 * src.length)] ?? 0.05)
  return out
})
</script>

<template>
  <div
    class="jot-card jot-card-voice" role="button"
    :aria-label="playing ? '暂停语音' : '播放语音'"
    @click.stop="toggle"
  >
    <span class="jot-vc-play">
      <component :is="playing ? icons.Pause : icons.Play" :size="13" />
    </span>
    <span class="jot-voicebar-wave">
      <span
        v-for="(p, i) in bars" :key="i"
        class="jot-voicebar-bar"
        :style="{ height: Math.max(3, p * 20) + 'px', opacity: i / bars.length <= progress ? 1 : 0.3 + p * 0.4 }"
      />
    </span>
    <span class="jot-voicebar-dur">{{ fmtDur(att.duration) }}</span>
    <span v-if="time" class="jot-vc-time">{{ time }}</span>
  </div>
</template>
