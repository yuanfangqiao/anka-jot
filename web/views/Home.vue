<script setup lang="ts">
/** Home — 屏①：搜索、时间线卡片流、底部细长四入口工具条、置顶区。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUi, type JotNote } from '../host'
import { push } from '../lib/nav'
import { sortedNotes, tags } from '../state/store'
import { dayLabelFull, sameDay } from '../lib/format'
import NoteCard from '../components/NoteCard.vue'
import Empty from '../components/Empty.vue'

const emit = defineEmits<{ create: [kind: 'text' | 'camera' | 'album' | 'voice'] }>()
const icons = useUi().icons

const tagColorMap = computed(() => Object.fromEntries(tags.value.map(t => [t.name, t.color])))

const pinned = computed(() => sortedNotes.value.filter(n => n.pinned))
const flow = computed(() => sortedNotes.value.filter(n => !n.pinned))

/** 四入口：细长工具条，墨色系图标，主入口用品牌色 */
const QUICK = [
  { kind: 'text', icon: 'Type', label: '文本', main: true },
  { kind: 'camera', icon: 'Camera', label: '拍照' },
  { kind: 'album', icon: 'Images', label: '相册' },
  { kind: 'voice', icon: 'Mic', label: '语音' },
] as const

function open(n: JotNote) { push('note', { id: n.id }) }

// @标签快捷过滤
const activeTag = ref('')
const visibleFlow = computed(() =>
  activeTag.value ? flow.value.filter(n => n.tags.includes(activeTag.value)) : flow.value)

/** 响应式列数（JS matchMedia，不赌宿主 md:/lg: 变体是否存在）：
 *  手机 2 列 / ≥768px 3 列 / ≥1280px 4 列 */
const colCount = ref(2)
const MQ = ['(min-width: 1280px)', '(min-width: 768px)'] as const
const mqs: MediaQueryList[] = []
function syncCols() {
  colCount.value = window.matchMedia(MQ[0]).matches ? 4
    : window.matchMedia(MQ[1]).matches ? 3 : 2
}
onMounted(() => {
  for (const q of MQ) {
    const m = window.matchMedia(q)
    m.addEventListener('change', syncCols)
    mqs.push(m)
  }
  syncCols()
})
onBeforeUnmount(() => {
  for (const m of mqs) m.removeEventListener('change', syncCols)
  mqs.length = 0
})

/** 均分 N 列（短列优先，按数量近似；卡片高度未知时最稳的策略） */
function splitCols(list: JotNote[], n: number): JotNote[][] {
  const cols: JotNote[][] = Array.from({ length: n }, () => [])
  for (const it of list) {
    let min = 0
    for (let i = 1; i < n; i++) if (cols[i].length < cols[min].length) min = i
    cols[min].push(it)
  }
  return cols
}

/** 时间线按创建日分组：今天 / 昨天 / 10月3日…（排序已按 createdAt，分组必然连续）。
 *  N 列手动拆分（短列优先），不依赖 CSS columns —— 部分宿主构建不含该工具类 */
const grouped = computed(() => {
  const gs: { label: string; ref: number; cols: JotNote[][] }[] = []
  for (const n of visibleFlow.value) {
    const last = gs[gs.length - 1]
    if (last && sameDay(last.ref, n.createdAt)) {
      const cols = last.cols
      let min = 0
      for (let i = 1; i < cols.length; i++) if (cols[i].length < cols[min].length) min = i
      cols[min].push(n)
    } else {
      gs.push({ label: dayLabelFull(n.createdAt), ref: n.createdAt, cols: splitCols([n], colCount.value) })
    }
  }
  return gs
})
const pinnedCols = computed(() => splitCols(pinned.value, colCount.value))
</script>

<template>
  <div class="jot-container relative flex h-full flex-col pt-2">
    <!-- 滚动区（底部留白避让悬浮胶囊工具条） -->
    <div class="jot-scroll-pad flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
      <!-- 搜索栏 -->
      <button
        type="button"
        class="flex w-full cursor-text items-center gap-2 rounded-full bg-bg-1 px-4 py-2.5 text-left jot-fs-13 text-ink-2 shadow-card"
        @click="push('search')"
      >
        <component :is="icons.Search" :size="15" />
        搜索文字、语音、OCR…
      </button>

    <!-- 标签过滤 -->
    <div v-if="tags.length" class="flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        class="shrink-0 cursor-pointer rounded-full px-2.5 py-1 jot-fs-115 transition-colors"
        :class="!activeTag ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="activeTag = ''"
      >全部</button>
      <button
        v-for="t in tags.slice(0, 12)" :key="t.name" type="button"
        class="shrink-0 cursor-pointer rounded-full px-2.5 py-1 jot-fs-115 transition-colors"
        :class="activeTag === t.name ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="activeTag = activeTag === t.name ? '' : t.name"
      >{{ t.name }}</button>
    </div>

    <!-- 置顶（响应式 N 列） -->
    <section v-if="pinned.length">
      <div class="jot-date-sep"><span class="jot-date-sep-label">置顶</span></div>
      <div class="jot-cols">
        <div v-for="(col, ci) in pinnedCols" :key="ci" class="jot-col">
          <NoteCard v-for="n in col" :key="n.id" :note="n" :tag-colors="tagColorMap" @open="open(n)" />
        </div>
      </div>
    </section>

    <!-- 时间线（按天分组 + 响应式 N 列瀑布流，日期分隔） -->
    <section v-for="(g, gi) in grouped" :key="g.label + gi">
      <div class="jot-date-sep"><span class="jot-date-sep-label">{{ g.label }}</span></div>
      <div class="jot-cols">
        <div v-for="(col, ci) in g.cols" :key="ci" class="jot-col">
          <NoteCard v-for="n in col" :key="n.id" :note="n" :tag-colors="tagColorMap" :show-day="false" @open="open(n)" />
        </div>
      </div>
    </section>
    <Empty
      v-if="!sortedNotes.length"
      icon="NotebookPen"
      title="还没有笔记"
      hint="点下方入口，打开即记、拍完即存、说完出字"
    />
    </div>

    <!-- 四入口：通栏方块工具条（jot-bar* 语义类，不赌宿主构建）。
         圆角方块瓷贴 + 玻璃底栏，与宿主胶囊 dock 形状区分 -->
    <footer class="jot-bar-wrap">
      <div class="jot-bar">
        <button
          v-for="q in QUICK" :key="q.kind" type="button"
          class="jot-bar-item"
          :class="'main' in q && q.main ? 'jot-bar-item-main' : ''"
          @click="emit('create', q.kind)"
        >
          <span class="jot-bar-tile">
            <component :is="icons[q.icon]" :size="19" :stroke-width="1.8" />
          </span>
          <span class="jot-bar-label">{{ q.label }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>