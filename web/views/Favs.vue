<script setup lang="ts">
/** Favs — 顶部「收藏」视图：只陈列 fav 笔记，瀑布流与首页同规格。 */
import { computed } from 'vue'
import { sortedNotes, tags } from '../state/store'
import { push } from '../lib/nav'
import { useColCount, splitCols } from '../lib/useColCount'
import NoteCard from '../components/NoteCard.vue'
import Empty from '../components/Empty.vue'

const favs = computed(() => sortedNotes.value.filter(n => n.fav))
const colCount = useColCount()
const cols = computed(() => splitCols(favs.value, colCount.value))
const tagColorMap = computed(() => Object.fromEntries(tags.value.map(t => [t.name, t.color])))
</script>

<template>
  <div class="jot-container flex h-full flex-col pt-3">
    <header class="flex shrink-0 items-end justify-between gap-2 px-4">
      <h1 class="jot-fs-20 font-bold text-ink-0">收藏</h1>
      <span class="jot-fs-115 text-ink-2">{{ favs.length }} 条</span>
    </header>

    <div class="jot-scroll-pad mt-2 min-h-0 flex-1 overflow-y-auto px-4">
      <div v-if="favs.length" class="jot-cols">
        <div v-for="(col, ci) in cols" :key="ci" class="jot-col">
          <NoteCard
            v-for="n in col" :key="n.id" :note="n" :tag-colors="tagColorMap"
            @open="push('note', { id: n.id })"
          />
        </div>
      </div>
      <Empty
        v-else
        icon="Star"
        title="还没有收藏"
        hint="卡片右下角「⋯」里可以收藏，收藏后会集中在这里"
      />
    </div>
  </div>
</template>
