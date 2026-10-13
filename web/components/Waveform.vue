<script setup lang="ts">
/** Waveform — canvas 波形（峰值数组渲染，零解码）。live 模式尾部脉冲。 */
import { onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  peaks: number[]
  progress?: number   // 0..1 播放进度染色
  live?: boolean
  height?: number
}>(), { progress: 0, live: false, height: 44 })

const cv = ref<HTMLCanvasElement>()

function draw() {
  const el = cv.value
  if (!el) return
  const dpr = window.devicePixelRatio || 1
  const w = el.clientWidth * dpr
  const h = (props.height) * dpr
  el.width = w; el.height = h
  const g = el.getContext('2d')!
  g.clearRect(0, 0, w, h)
  const peaks = props.peaks.length ? props.peaks : [0.05]
  const barW = Math.max(2 * dpr, w / Math.max(peaks.length, 60) * 0.6)
  const gap = Math.max(1.4 * dpr, w / Math.max(peaks.length, 60))
  const mid = h / 2
  const css = getComputedStyle(el)
  const cPlayed = css.getPropertyValue('--primary') || '#5B8CFF'
  const cRest = css.getPropertyValue('--text-2') || '#6b7488'
  const n = Math.floor(w / gap)
  for (let i = 0; i < n; i++) {
    const p = peaks[Math.floor(i / n * peaks.length)] ?? 0.05
    const bh = Math.max(2 * dpr, p * h * 0.92)
    const played = i / n <= props.progress
    g.fillStyle = played ? cPlayed : cRest
    g.globalAlpha = played ? 1 : 0.55
    const x = i * gap
    g.beginPath()
    g.roundRect(x, mid - bh / 2, barW, bh, barW / 2)
    g.fill()
  }
  g.globalAlpha = 1
}

onMounted(draw)
watch(() => [props.peaks, props.progress], draw, { deep: false })
defineExpose({ redraw: draw })
</script>

<template>
  <canvas ref="cv" class="w-full" :style="{ height: height + 'px' }" :class="{ 'animate-pulse-dot': live }" />
</template>
