<script setup lang="ts">
/** Search — 全文搜索：本地索引 + 类型/标签过滤 + 高亮片段。 */
import { computed, onMounted, ref } from 'vue'
import { useUi } from '../host'
import { pop, push } from '../lib/nav'
import { index, notes, tags } from '../state/store'
import type { Hit } from '../lib/search'
import Empty from '../components/Empty.vue'

const icons = useUi().icons
const q = ref('')
const typeFilter = ref<'' | 'image' | 'audio'>('')
const tagFilter = ref('')

const FIELD_LABEL: Record<string, string> = { title: '标题', text: '正文', ocr: 'OCR', transcript: '转写' }

const hits = computed<Hit[]>(() => {
  let r = q.value.trim() ? index.query(q.value.trim()) : []
  if (typeFilter.value) {
    r = r.filter(h => notes.value.find(n => n.id === h.noteId)?.atts?.some(a => a.kind === typeFilter.value))
  }
  if (tagFilter.value) {
    r = r.filter(h => notes.value.find(n => n.id === h.noteId)?.tags.includes(tagFilter.value))
  }
  return r
})

function highlight(s: string): string {
  if (!q.value.trim()) return s
  const esc = q.value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return s.replace(new RegExp(`(${esc})`, 'gi'), '⟨$1⟩')
}

onMounted(() => setTimeout(() => document.getElementById('jot-search')?.focus(), 60))
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4 pb-28 pt-3">
    <div class="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-bg-0/85 px-3 py-2 backdrop-blur-xl">
      <button type="button" class="cursor-pointer rounded-full p-2 text-ink-1 hover:bg-glass" aria-label="返回" title="返回" @click="pop()">
        <component :is="icons.ChevronLeft" :size="20" />
      </button>
      <div class="flex flex-1 items-center gap-2 rounded-full bg-bg-1 px-3.5 py-2 shadow-card">
        <component :is="icons.Search" :size="15" class="text-ink-2" />
        <input
          id="jot-search" v-model="q" placeholder="搜索文字、语音、OCR…"
          class="w-full bg-transparent text-[14px] text-ink-0 outline-none placeholder:text-ink-2/60"
        />
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="f in [{ v: '', l: '全部' }, { v: 'image', l: '仅图片' }, { v: 'audio', l: '仅语音' }]"
        :key="f.v" type="button"
        class="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] transition-colors"
        :class="typeFilter === f.v ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="typeFilter = f.v as any"
      >{{ f.l }}</button>
      <span class="w-1" />
      <button
        v-for="t in tags.slice(0, 8)" :key="t.name" type="button"
        class="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] transition-colors"
        :class="tagFilter === t.name ? 'bg-brand text-white' : 'bg-bg-1 text-ink-1'"
        @click="tagFilter = tagFilter === t.name ? '' : t.name"
      >{{ t.name }}</button>
    </div>

    <!-- 结果 -->
    <div class="flex flex-col gap-2">
      <article
        v-for="h in hits" :key="h.noteId"
        class="cursor-pointer rounded-card bg-bg-1 p-3.5 shadow-card transition-transform duration-micro active:scale-[0.985]"
        @click="push('note', { id: h.noteId })"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-[14px] font-medium text-ink-0">{{ h.title }}</p>
          <span class="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">{{ FIELD_LABEL[h.field] }}</span>
        </div>
        <p class="mt-1 line-clamp-2 text-[12.5px] leading-5 text-ink-1">
          <template v-for="(part, i) in highlight(h.snippet).split(/[⟨⟩]/)" :key="i">
            <mark v-if="i % 2 === 1" class="rounded bg-brand/25 px-0.5 text-brand-soft">{{ part }}</mark>
            <template v-else>{{ part }}</template>
          </template>
        </p>
      </article>
      <Empty v-if="q.trim() && !hits.length" icon="SearchX" title="没有找到" hint="试试更短的关键词，或换个过滤条件" />
      <Empty v-if="!q.trim()" icon="Search" title="全文搜索" hint="可搜标题、正文、拍照 OCR 文字和语音转写稿" />
    </div>
  </div>
</template>
