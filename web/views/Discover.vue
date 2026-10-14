<script setup lang="ts">
/** Discover — 屏⑤：最近标签、智能相册（按地点/周聚合）、AI 本周摘要。 */
import { computed, ref } from 'vue'
import { callJot, useUi, type JotNote } from '../host'
import { push } from '../lib/nav'
import { isoWeekKey } from '../lib/format'
import { notes, tags } from '../state/store'
import TagChip from '../components/TagChip.vue'
import Empty from '../components/Empty.vue'

const icons = useUi().icons

// ─── 智能相册：按地点名 / 按自然周聚合（≥2 条成册） ──
interface Album { key: string; title: string; sub: string; notes: JotNote[] }
const albums = computed<Album[]>(() => {
  const byLoc = new Map<string, JotNote[]>()
  const byWeek = new Map<string, JotNote[]>()
  for (const n of notes.value) {
    const loc = n.location?.name
    if (loc) { if (!byLoc.has(loc)) byLoc.set(loc, []); byLoc.get(loc)!.push(n) }
    const wk = isoWeekKey(n.createdAt)
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk)!.push(n)
  }
  const out: Album[] = []
  for (const [loc, ns] of byLoc) {
    if (ns.length >= 2) out.push({ key: 'loc:' + loc, title: loc, sub: `${ns.length} 条 · 地点`, notes: ns.sort((a, b) => b.createdAt - a.createdAt) })
  }
  for (const [wk, ns] of byWeek) {
    if (ns.length >= 3) out.push({ key: 'wk:' + wk, title: `这一周（${wk.slice(5).replace('-', '/')} 起）`, sub: `${ns.length} 条 · 周聚合`, notes: ns.sort((a, b) => b.createdAt - a.createdAt) })
  }
  return out.slice(0, 8)
})
const openAlbum = ref<Album | null>(null)

// ─── AI 本周摘要 ──
const aiBusy = ref(false)
const aiText = ref('')
async function weeklySummary() {
  aiBusy.value = true; aiText.value = ''
  try {
    const monday = Date.now() - ((new Date().getDay() + 6) % 7) * 86400000
    const r = await callJot('summarize', { sinceMs: monday })
    aiText.value = r?.ok ? r.markdown : (r?.message ?? 'AI 未配置')
  } catch { aiText.value = 'AI 服务不可用' } finally { aiBusy.value = false }
}

const recentTags = computed(() => [...tags.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 10))
</script>

<template>
  <div class="relative mx-auto h-full w-full max-w-2xl">
    <div class="flex h-full w-full flex-col gap-5 overflow-y-auto px-4 pb-28 pt-4">
    <!-- 最近标签 -->
    <section v-if="recentTags.length">
      <p class="mb-2 px-1 jot-fs-12 font-semibold text-ink-1">最近标签</p>
      <div class="flex flex-wrap gap-1.5">
        <TagChip v-for="t in recentTags" :key="t.name" :name="t.name" :color="t.color" @click="push('search')" />
      </div>
    </section>

    <!-- 智能相册 -->
    <section>
      <p class="mb-2 px-1 jot-fs-12 font-semibold text-ink-1">智能相册</p>
      <div v-if="albums.length" class="grid grid-cols-2 gap-2.5">
        <button
          v-for="a in albums" :key="a.key" type="button"
          class="cursor-pointer rounded-card bg-bg-1 p-3.5 text-left shadow-card transition-transform duration-micro active:scale-95"
          @click="openAlbum = a"
        >
          <component :is="icons.MapPin" v-if="a.key.startsWith('loc')" :size="16" class="mb-1.5 text-brand" />
          <component :is="icons.CalendarRange" v-else :size="16" class="mb-1.5 text-brand-cyan" />
          <p class="truncate jot-fs-135 font-medium text-ink-0">{{ a.title }}</p>
          <p class="mt-0.5 jot-fs-11 text-ink-2">{{ a.sub }}</p>
        </button>
      </div>
      <Empty v-else icon="Album" title="还没有智能相册" hint="同一地点记 2 条、或一周记 3 条，自动成册" />
    </section>

    <!-- AI 本周摘要 -->
    <section>
      <p class="mb-2 px-1 jot-fs-12 font-semibold text-ink-1">推荐</p>
      <div class="rounded-card bg-gradient-to-br from-brand/15 to-brand-cyan/10 p-4 shadow-card">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1.5 jot-fs-13 font-medium text-brand">
            <component :is="icons.Sparkles" :size="15" />AI Summary
          </span>
          <button
            type="button"
            class="cursor-pointer rounded-full bg-brand px-3 py-1.5 jot-fs-12 font-medium text-white transition-transform active:scale-95 disabled:opacity-50"
            :disabled="aiBusy" @click="weeklySummary"
          >{{ aiBusy ? '生成中…' : '总结本周笔记' }}</button>
        </div>
        <p v-if="aiText" class="mt-3 whitespace-pre-wrap jot-fs-13 leading-6 text-ink-1">{{ aiText }}</p>
      </div>
    </section>
    </div>

    <!-- 相册详情弹层（应用内 absolute，不再传送到宿主 body 沉到 dock 下） -->
    <div v-if="openAlbum" class="absolute inset-0 z-50 flex items-end justify-center bg-black/45" @click="openAlbum = null">
        <div class="jot-sheet-maxh w-full max-w-md animate-fade-up overflow-y-auto rounded-t-shell bg-bg-1 p-4" @click.stop>
          <p class="mb-3 jot-fs-15 font-semibold text-ink-0">{{ openAlbum.title }}</p>
          <button
            v-for="n in openAlbum.notes" :key="n.id" type="button"
            class="mb-1.5 flex w-full cursor-pointer items-center gap-2 rounded-xl bg-bg-2 p-3 text-left"
            @click="openAlbum = null; push('note', { id: n.id })"
          >
            <component :is="icons.FileText" :size="15" class="shrink-0 text-ink-2" />
            <span class="truncate jot-fs-13 text-ink-0">{{ n.title || (n.text || '未命名').slice(0, 30) }}</span>
          </button>
        </div>
      </div>
  </div>
</template>
