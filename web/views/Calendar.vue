<script setup lang="ts">
/** Calendar — 屏④：月历打点 + 当日垂直时间轴。
 *
 *  数据源走服务端：整月计数（一次请求，命中 rev 只回版本号）+ 按天 keyset 分页。
 *  写路径不变：新增/编辑/删除仍先落本地库再走 outbox，这里只读。
 *  卡片是服务端投影（正文只有 600 字预览），点开时按 id 取全文回填本地。
 */
import { computed, onActivated, onDeactivated, ref, watch } from 'vue'
import { toast, useUi } from '../host'
import { push } from '../lib/nav'
import { dayLabel, fmtClock, sameDay } from '../lib/format'
import { pushOutbox, syncState } from '../lib/sync'
import {
  cardToNote, dayBounds, ensureLocalNote, loadDay, loadMonth, peekMonth,
  type CalendarCard, type MonthData,
} from '../lib/api.calendar'
import NoteCard from '../components/NoteCard.vue'

const icons = useUi().icons
const now = new Date()
const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
const year = ref(now.getFullYear())
const month = ref(now.getMonth()) // 0-based
const selected = ref(todayMs)

/** 月历：服务端整月真实条数（不是打点数，封顶留在模板里） */
const monthData = ref<MonthData | null>(null)
const monthStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const monthError = ref('')
const monthStale = ref(false)
let monthSeq = 0

/** 当日：keyset 分页的卡片流 */
const cards = ref<CalendarCard[]>([])
const dayStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const dayError = ref('')
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const loadingMore = ref(false)
const dayStale = ref(false)
let daySeq = 0
let active = false
let openingId = ''
let leftRev = -1 // 离开时的同步水位：回来若变了就提示刷新（正文编辑不改条数）

const cells = computed(() => {
  const first = new Date(year.value, month.value, 1)
  const start = (first.getDay() + 6) % 7 // 周一开头
  const days = new Date(year.value, month.value + 1, 0).getDate()
  const out: ({ day: number; ms: number } | null)[] = []
  for (let i = 0; i < start; i++) out.push(null)
  for (let d = 1; d <= days; d++) out.push({ day: d, ms: new Date(year.value, month.value, d).getTime() })
  return out
})

function errText(e: unknown) {
  return (e as Error)?.message || '网络异常'
}

/** 某天真实条数；跨月单元格不参与（切月时 monthData 已置空） */
function countOf(ms: number) {
  const data = monthData.value
  if (!data) return 0
  const d = new Date(ms)
  if (d.getFullYear() !== year.value || d.getMonth() !== month.value) return 0
  return data.days[d.getDate() - 1] ?? 0
}

/** 组头条数：优先服务端计数，取不到时退回已加载条数 */
const selectedCount = computed(() => {
  const data = monthData.value
  const d = new Date(selected.value)
  if (data && d.getFullYear() === year.value && d.getMonth() === month.value) {
    return data.days[d.getDate() - 1] ?? 0
  }
  return cards.value.length
})

const dayNotes = computed(() => cards.value.map(card => ({ card, note: cardToNote(card) })))
const showDayStale = computed(() => dayStale.value && dayStatus.value === 'ready')

async function loadMonthData() {
  const my = ++monthSeq
  const cached = peekMonth(year.value, month.value)
  if (cached) { monthData.value = cached; monthStatus.value = 'ready' } else monthStatus.value = 'loading'
  monthError.value = ''
  try {
    const data = await loadMonth(year.value, month.value)
    if (my !== monthSeq) return
    monthData.value = data
    monthStatus.value = 'ready'
    monthStale.value = false
  } catch (e) {
    if (my !== monthSeq) return
    // 有上次结果就继续用，标一个缓存角标
    if (monthData.value) { monthStatus.value = 'ready'; monthStale.value = true } else {
      monthStatus.value = 'error'
      monthError.value = errText(e)
    }
  }
}

async function loadDayPage(reset: boolean) {
  if (!reset && (loadingMore.value || !hasMore.value || dayStatus.value !== 'ready')) return
  const my = reset ? ++daySeq : daySeq
  if (reset) {
    cards.value = []
    cursor.value = null
    hasMore.value = false
    dayError.value = ''
    dayStale.value = false
    dayStatus.value = 'loading'
  } else loadingMore.value = true
  try {
    const [start, end] = dayBounds(selected.value)
    const r = await loadDay(start, end, reset ? null : cursor.value)
    if (my !== daySeq) return
    cards.value = reset ? r.cards : [...cards.value, ...r.cards]
    cursor.value = r.nextCursor
    hasMore.value = r.hasMore
    dayStatus.value = 'ready'
  } catch (e) {
    if (my !== daySeq) return
    if (reset) { dayStatus.value = 'error'; dayError.value = errText(e) }
  } finally {
    if (my === daySeq) loadingMore.value = false
  }
}

function selectDay(ms: number) {
  if (ms === selected.value) return
  selected.value = ms
  void loadDayPage(true)
}

function goMonth(delta: number) {
  const d = new Date(year.value, month.value + delta, 1)
  year.value = d.getFullYear()
  month.value = d.getMonth()
  monthData.value = null
  monthStale.value = false
  const current = year.value === now.getFullYear() && month.value === now.getMonth()
  selected.value = current ? todayMs : new Date(year.value, month.value, 1).getTime()
  void loadMonthData()
  void loadDayPage(true)
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement | null
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > 320) return
  if (hasMore.value && !loadingMore.value) void loadDayPage(false)
}

/** 打开笔记：本地没有就按 id 取全文并回填，之后完全复用原有详情/编辑链路 */
async function openNote(c: CalendarCard) {
  if (openingId) return
  openingId = c.id
  try {
    await ensureLocalNote(c.id)
    push('note', { id: c.id })
  } catch (e) {
    toast(`笔记打不开：${errText(e)}`, false)
  } finally {
    openingId = ''
  }
}

/** 同步完成后静默校验：月份走 rev（未变零成本），条数变了才提示刷新，不重置滚动位置 */
async function refreshSoft(force = false) {
  if (!active) return
  const before = selectedCount.value
  await loadMonthData()
  if (!active) return
  if (force || selectedCount.value !== before) dayStale.value = true
}

async function boot() {
  active = true
  // 日历只统计已推送的记录：先给 outbox 一点时间，但不阻塞首屏
  if (syncState.pending > 0 || syncState.backendUp === false) {
    await Promise.race([pushOutbox().catch(() => {}), new Promise(r => setTimeout(r, 1500))])
    if (!active) return
  }
  const before = selectedCount.value
  await loadMonthData()
  if (!active) return
  if (dayStatus.value === 'idle') await loadDayPage(true)
  // 条数变了或有新同步进展时，回来只给刷新提示，不重置列表和滚动位置
  else if (selectedCount.value !== before || syncState.lastPullRev !== leftRev) dayStale.value = true
}

onActivated(() => { void boot() })
onDeactivated(() => {
  active = false
  leftRev = syncState.lastPullRev
  monthSeq++ // 丢弃在途响应，避免回来时被旧数据覆盖
  daySeq++
})

watch(() => syncState.lastPullRev, () => { void refreshSoft() })
watch(() => syncState.pending, (nowPending, before) => {
  if (before > 0 && nowPending === 0) void refreshSoft()
})
</script>

<template>
  <div
    class="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4 pb-28 pt-4"
    @scroll.passive="onScroll"
  >
    <!-- 月历 -->
    <div class="rounded-card bg-bg-1 p-4 shadow-card">
      <div class="mb-3 flex items-center justify-between">
        <button type="button" class="jot-cal-nav" aria-label="上一月" title="上一月" @click="goMonth(-1)">
          <component :is="icons.ChevronLeft" :size="17" />
        </button>
        <p class="jot-fs-15 font-semibold">{{ year }}年{{ month + 1 }}月</p>
        <button type="button" class="jot-cal-nav" aria-label="下一月" title="下一月" @click="goMonth(1)">
          <component :is="icons.ChevronRight" :size="17" />
        </button>
      </div>
      <div class="jot-cal-grid jot-fs-105 text-ink-2">
        <span v-for="w in ['一','二','三','四','五','六','日']" :key="w">{{ w }}</span>
      </div>
      <div class="jot-cal-grid mt-1">
        <span v-for="(c, i) in cells" :key="i" class="jot-cal-cell">
          <button
            v-if="c" type="button"
            class="jot-cal-day cursor-pointer rounded-xl jot-fs-13 transition-colors"
            :class="sameDay(c.ms, selected) ? 'bg-brand font-semibold text-white' : 'text-ink-1 hover:bg-glass'"
            @click="selectDay(c.ms)"
          >
            {{ c.day }}
            <!-- 打点走语义类：尺寸/间距/配色不依赖宿主是否构建 h-1/w-1/gap-0.5/bg-white -->
            <span
              v-if="countOf(c.ms)"
              class="jot-cal-dots"
              :class="{ 'is-sel': sameDay(c.ms, selected) }"
            >
              <span v-for="(_, k) in Math.min(3, countOf(c.ms))" :key="k" class="jot-cal-dot" />
            </span>
          </button>
        </span>
      </div>
      <p v-if="monthStatus === 'loading'" class="jot-cal-note">载入中…</p>
      <p v-else-if="monthStatus === 'error'" class="jot-cal-note jot-cal-warn">
        日历加载失败 · <button type="button" class="jot-cal-link" @click="loadMonthData">重试</button>
      </p>
      <p v-else-if="monthStale" class="jot-cal-note">离线 · 显示上次结果</p>
    </div>

    <!-- 当日时间轴 -->
    <div class="flex items-center justify-between gap-2 px-1">
      <p class="jot-fs-12 font-medium text-ink-2">
        {{ dayLabel(selected) }} ·
        {{ monthStatus === 'loading' && !monthData ? '…' : selectedCount }} 条
      </p>
      <div class="flex items-center gap-1.5">
        <button v-if="showDayStale" type="button" class="jot-cal-chip is-warn" @click="loadDayPage(true)">
          有更新 · 刷新
        </button>
        <span v-if="syncState.pending > 0" class="jot-cal-chip">{{ syncState.pending }} 条待同步</span>
        <span v-else-if="!syncState.online" class="jot-cal-chip">离线</span>
      </div>
    </div>

    <!-- 首屏骨架 -->
    <div v-if="dayStatus === 'loading'" class="flex flex-col gap-3 pl-5">
      <div v-for="i in 3" :key="i" class="jot-cal-skel" />
    </div>

    <!-- 失败兜底 -->
    <div v-else-if="dayStatus === 'error'" class="flex flex-col items-center gap-2 py-10">
      <p class="jot-fs-125 text-ink-2">这一天的记录没拉到：{{ dayError }}</p>
      <button type="button" class="jot-cal-retry" @click="loadDayPage(true)">重试</button>
    </div>

    <div v-else class="relative flex flex-col gap-3 pl-5">
      <span v-if="dayNotes.length" class="jot-rail bottom-2 top-2 w-px bg-line" />
      <div v-for="it in dayNotes" :key="it.card.id" class="relative">
        <span class="jot-dot" />
        <p class="mb-1 jot-fs-11 text-ink-2">{{ fmtClock(it.note.createdAt) }}</p>
        <!-- 与主页同款卡片；列表是服务端投影，只读（置顶角标与「⋯」不出现） -->
        <NoteCard :note="it.note" :show-day="false" :show-time="false" readonly @open="openNote(it.card)" />
      </div>

      <div v-if="loadingMore" class="jot-cal-skel" />
      <button v-else-if="hasMore" type="button" class="jot-cal-retry self-center" @click="loadDayPage(false)">
        加载更多
      </button>

      <p v-if="!dayNotes.length" class="py-8 text-center jot-fs-125 text-ink-2">这一天没有记录</p>
    </div>
  </div>
</template>
