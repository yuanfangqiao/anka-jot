<script setup lang="ts">
/** Home — 屏①：搜索、时间线卡片流、底部细长四入口工具条、置顶区。 */
import { computed, ref } from 'vue'
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

/** 时间线按创建日分组：今天 / 昨天 / 10月3日…（排序已按 createdAt，分组必然连续） */
const grouped = computed(() => {
  const gs: { label: string; ref: number; notes: JotNote[] }[] = []
  for (const n of visibleFlow.value) {
    const last = gs[gs.length - 1]
    if (last && sameDay(last.ref, n.createdAt)) last.notes.push(n)
    else gs.push({ label: dayLabelFull(n.createdAt), ref: n.createdAt, notes: [n] })
  }
  return gs
})
</script>

<template>
  <div class="relative mx-auto flex h-full w-full max-w-2xl flex-col pt-2">
    <!-- 滚动区（底部留白避让贴底工具条） -->
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-[72px]">
      <!-- 搜索栏 -->
      <button
        type="button"
        class="flex w-full cursor-text items-center gap-2 rounded-full bg-bg-1 px-4 py-2.5 text-left text-[13px] text-ink-2 shadow-card"
        @click="push('search')"
      >
        <component :is="icons.Search" :size="15" />
        搜索文字、语音、OCR…
      </button>

    <!-- 标签过滤 -->
    <div v-if="tags.length" class="flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        class="shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] transition-colors"
        :class="!activeTag ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="activeTag = ''"
      >全部</button>
      <button
        v-for="t in tags.slice(0, 12)" :key="t.name" type="button"
        class="shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] transition-colors"
        :class="activeTag === t.name ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="activeTag = activeTag === t.name ? '' : t.name"
      >{{ t.name }}</button>
    </div>

    <!-- 置顶（双列瀑布流） -->
    <section v-if="pinned.length">
      <p class="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-ink-2">置顶</p>
      <div class="columns-2 gap-2.5">
        <NoteCard v-for="n in pinned" :key="n.id" :note="n" :tag-colors="tagColorMap" @open="open(n)" />
      </div>
    </section>

    <!-- 时间线（按天分组 + 双列瀑布流，日期分割线） -->
    <section v-for="(g, gi) in grouped" :key="g.label + gi">
      <div class="mb-2 flex items-center gap-3 px-1">
        <span class="h-px flex-1 bg-black/[0.08]" />
        <span class="text-[11px] font-medium tracking-wide text-ink-2">{{ g.label }}</span>
        <span class="h-px flex-1 bg-black/[0.08]" />
      </div>
      <div class="columns-2 gap-2.5">
        <NoteCard v-for="n in g.notes" :key="n.id" :note="n" :tag-colors="tagColorMap" :show-day="false" @open="open(n)" />
      </div>
    </section>
    <Empty
      v-if="!sortedNotes.length"
      icon="NotebookPen"
      title="还没有笔记"
      hint="点下方入口，打开即记、拍完即存、说完出字"
    />
    </div>

    <!-- 四入口：全宽贴底细长工具条（分段控件质感），列表从其下方滚过 -->
    <footer class="absolute inset-x-0 bottom-0 bg-white/75 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.10)] backdrop-blur-xl saturate-150">
      <div class="grid grid-cols-4 divide-x divide-black/[0.06]">
        <button
          v-for="q in QUICK" :key="q.kind" type="button"
          class="flex cursor-pointer flex-col items-center gap-1 py-2.5 transition-all duration-micro active:scale-95"
          :class="'main' in q && q.main ? 'text-brand' : 'text-ink-2'"
          @click="emit('create', q.kind)"
        >
          <component :is="icons[q.icon]" :size="22" :stroke-width="1.8" />
          <span class="text-[10px] font-medium leading-tight">{{ q.label }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>