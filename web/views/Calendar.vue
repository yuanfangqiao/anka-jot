<script setup lang="ts">
/** Calendar — 屏④：月历打点 + 当日垂直时间轴（图集/音频/文本卡）。 */
import { computed, ref } from 'vue'
import { useUi, type JotNote } from '../host'
import { push } from '../lib/nav'
import { dayLabel, fmtClock, sameDay } from '../lib/format'
import { notes } from '../state/store'
import Waveform from '../components/Waveform.vue'

const icons = useUi().icons
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth()) // 0-based
const selected = ref(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())

const cells = computed(() => {
  const first = new Date(year.value, month.value, 1)
  const start = (first.getDay() + 6) % 7 // 周一开头
  const days = new Date(year.value, month.value + 1, 0).getDate()
  const out: ({ day: number; ms: number } | null)[] = []
  for (let i = 0; i < start; i++) out.push(null)
  for (let d = 1; d <= days; d++) out.push({ day: d, ms: new Date(year.value, month.value, d).getTime() })
  return out
})

const byDay = computed(() => {
  const m = new Map<number, JotNote[]>()
  for (const n of notes.value) {
    const key = new Date(new Date(n.createdAt).setHours(0, 0, 0, 0)).getTime()
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(n)
  }
  return m
})

const dayNotes = computed(() =>
  (byDay.value.get(selected.value) ?? []).sort((a, b) => a.createdAt - b.createdAt))

function prev() { const d = new Date(year.value, month.value - 1, 1); year.value = d.getFullYear(); month.value = d.getMonth() }
function next() { const d = new Date(year.value, month.value + 1, 1); year.value = d.getFullYear(); month.value = d.getMonth() }

function firstAudio(n: JotNote) { return n.atts?.find(a => a.kind === 'audio') }
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4 pb-28 pt-4">
    <!-- 月历 -->
    <div class="rounded-card bg-bg-1 p-4 shadow-card">
      <div class="mb-3 flex items-center justify-between">
        <button type="button" class="cursor-pointer rounded-full p-1.5 text-ink-1 hover:bg-glass" aria-label="上一月" title="上一月" @click="prev">
          <component :is="icons.ChevronLeft" :size="17" />
        </button>
        <p class="jot-fs-15 font-semibold">{{ year }}年{{ month + 1 }}月</p>
        <button type="button" class="cursor-pointer rounded-full p-1.5 text-ink-1 hover:bg-glass" aria-label="下一月" title="下一月" @click="next">
          <component :is="icons.ChevronRight" :size="17" />
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center jot-fs-105 text-ink-2">
        <span v-for="w in ['一','二','三','四','五','六','日']" :key="w">{{ w }}</span>
      </div>
      <div class="mt-1 grid grid-cols-7 gap-1">
        <span v-for="(c, i) in cells" :key="i" class="aspect-square">
          <button
            v-if="c" type="button"
            class="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-xl jot-fs-13 transition-colors"
            :class="sameDay(c.ms, selected) ? 'bg-brand font-semibold text-white' : 'text-ink-1 hover:bg-glass'"
            @click="selected = c.ms"
          >
            {{ c.day }}
            <span class="flex h-1 gap-0.5">
              <span
                v-for="(_, k) in Math.min(3, byDay.get(c.ms)?.length ?? 0)" :key="k"
                class="h-1 w-1 rounded-full"
                :class="sameDay(c.ms, selected) ? 'bg-white/90' : 'bg-brand'"
              />
            </span>
          </button>
        </span>
      </div>
    </div>

    <!-- 当日时间轴 -->
    <p class="px-1 jot-fs-12 font-medium text-ink-2">{{ dayLabel(selected) }} · {{ dayNotes.length }} 条</p>
    <div class="relative flex flex-col gap-3 pl-5">
      <span class="jot-rail bottom-2 top-2 w-px bg-line" />
      <div v-for="n in dayNotes" :key="n.id" class="relative">
        <span class="jot-dot top-5 h-2 w-2 rounded-full border-2 border-bg-0 bg-brand" />
        <p class="mb-1 jot-fs-11 text-ink-2">{{ fmtClock(n.createdAt) }}</p>
        <article
          class="jot-press cursor-pointer rounded-card bg-bg-1 p-3.5 shadow-card duration-micro"
          @click="push('note', { id: n.id })"
        >
          <p class="jot-fs-14 font-medium text-ink-0">{{ n.title || (n.text || '未命名').split('\n')[0].slice(0, 40) }}</p>
          <p v-if="n.text && n.title" class="mt-0.5 jot-clamp-2 jot-fs-125 text-ink-1">{{ n.text.slice(0, 90) }}</p>
          <div v-if="firstAudio(n)" class="mt-2">
            <Waveform :peaks="firstAudio(n)!.peaks ?? []" :height="26" />
          </div>
          <p v-if="n.atts?.some(a => a.kind === 'image')" class="mt-1.5 flex items-center gap-1 jot-fs-11 text-ink-2">
            <component :is="icons.Image" :size="12" />{{ n.atts.filter(a => a.kind === 'image').length }} 张图片
          </p>
        </article>
      </div>
      <p v-if="!dayNotes.length" class="py-8 text-center jot-fs-125 text-ink-2">这一天没有记录</p>
    </div>
  </div>
</template>
