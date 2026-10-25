<script setup lang="ts">
defineOptions({ name: 'Todo' })
import { useViewScroll } from '../lib/useViewScroll'
/** Todo — 顶部「待办」视图：不另写卡片，直接复用首页 NoteCard 与瀑布流。
 *  只筛出「打了待办标志」的笔记（与事项列表无关）：还有没勾完的排上面，全部勾完的收进折叠区。
 *  数据来自 store（本地事实源，同步在后台已完成），卡片直接勾选并可撤销。 */
import { computed, ref } from 'vue'
import { useUi, type JotNote } from '../host'
import { notes, tags } from '../state/store'
import { push } from '../lib/nav'
import NoteCard from '../components/NoteCard.vue'
import Empty from '../components/Empty.vue'
import { useColCount, splitCols } from '../lib/useColCount'

const list = ref<HTMLElement | null>(null)
useViewScroll(list)
const icons = useUi().icons
const tagColorMap = computed(() => Object.fromEntries(tags.value.map(t => [t.name, t.color])))

/** 只看待办标志；事项只用于分组与计数（卡面自己读 note.todos） */
const todoNotes = computed(() =>
  notes.value
    .filter(n => !n.deleted && n.todo)
    .map(n => ({ note: n, todos: n.todos ?? [] }))
    .sort((a, b) => b.note.createdAt - a.note.createdAt))

/** 还有未勾选项（或还没填事项）的笔记 → 卡片墙；全部勾完的笔记 → 折叠区 */
const pendingNotes = computed(() =>
  todoNotes.value
    .filter(x => !x.todos.length || x.todos.some(t => !t.done))
    .map(x => x.note))
const doneNotes = computed(() =>
  todoNotes.value
    .filter(x => x.todos.length > 0 && x.todos.every(t => t.done))
    .map(x => x.note))

/** 头部进度按「待办项」计（一张卡可能有好几条） */
const allItems = computed(() => todoNotes.value.flatMap(x => x.todos))
const pendingCount = computed(() => allItems.value.filter(t => !t.done).length)
const doneCount = computed(() => allItems.value.filter(t => t.done).length)

const showDone = ref(false)

/** 响应式列数 / 拆列与首页同一套，尺寸、间距完全一致 */
const colCount = useColCount()
const pendingCols = computed(() => splitCols(pendingNotes.value, colCount.value))
const doneCols = computed(() => splitCols(doneNotes.value, colCount.value))

function open(n: JotNote) { push('note', { id: n.id }) }
</script>

<template>
  <div class="jot-container flex h-full flex-col pt-3">
    <header class="shrink-0 px-4">
      <div class="flex items-end justify-between gap-2">
        <h1 class="jot-fs-20 font-bold text-ink-0">待办</h1>
        <span class="jot-todo-count">{{ pendingCount }} 项未完成</span>
      </div>
      <div class="jot-todo-bar">
        <i :style="{ width: `${allItems.length ? doneCount / allItems.length * 100 : 0}%` }" />
      </div>
    </header>

    <div ref="list" class="jot-scroll-pad mt-3 min-h-0 flex-1 overflow-y-auto px-4">
      <div v-if="pendingNotes.length" class="jot-cols">
        <div v-for="(col, ci) in pendingCols" :key="ci" class="jot-col">
          <NoteCard
            v-for="n in col" :key="n.id"
            :note="n" :tag-colors="tagColorMap"
            @open="open(n)"
          />
        </div>
      </div>

      <Empty
        v-if="!pendingNotes.length"
        icon="ListChecks"
        :title="doneNotes.length ? '待办都完成了' : '没有待办'"
        hint="在笔记详情点亮「待办」开关，笔记就会出现在这里"
      />

      <section v-if="doneNotes.length" class="mt-4">
        <button type="button" class="jot-done-toggle" @click="showDone = !showDone">
          <component :is="icons.ChevronRight" :size="13" :class="{ 'rotate-90': showDone }" class="transition-transform" />
          已完成 {{ doneNotes.length }}
        </button>
        <div v-if="showDone" class="jot-cols mt-1">
          <div v-for="(col, ci) in doneCols" :key="ci" class="jot-col">
            <NoteCard
              v-for="n in col" :key="n.id"
              :note="n" :tag-colors="tagColorMap"
              @open="open(n)"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
