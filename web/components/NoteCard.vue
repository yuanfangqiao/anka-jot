<script setup lang="ts">
/** NoteCard — 小红书瀑布流竖卡：封面图自然高度 + 标题/摘要 + 底部来源与时间。 */
import { computed, onMounted, ref } from 'vue'
import { useUi, type JotNote } from '../host'
import { coverOf, hasAudio } from '../state/store'
import { dayLabel, fmtClock } from '../lib/format'

const props = withDefaults(defineProps<{
  note: JotNote
  tagColors?: Record<string, string | null>
  /** 时间线按天分组时组头已显示日期，卡片内隐藏避免重复 */
  showDay?: boolean
}>(), { showDay: true })
const emit = defineEmits<{ open: [] }>()
const icons = useUi().icons

const cover = ref<string | null>(null)
onMounted(async () => { cover.value = await coverOf(props.note.id) })

const SRC_ICON: Record<string, string> = {
  text: 'Type', camera: 'Camera', album: 'Images', voice: 'Mic', share: 'Share2',
}
const SRC_HUE: Record<string, string> = {
  text: '#5E9B74', camera: '#E0A53E', album: '#6B8FC4', voice: '#8B7BD8', share: '#5FA8A0',
}

/** 迷你波形条（有音频附件时展示） */
const miniPeaks = computed(() => {
  const a = props.note.atts?.find(x => x.kind === 'audio' && x.peaks?.length)
  if (!a?.peaks) return null
  const src = a.peaks
  const out: number[] = []
  for (let i = 0; i < 18; i++) out.push(src[Math.floor(i / 18 * src.length)] ?? 0.05)
  return out
})

function excerpt(n: JotNote): string {
  const t = (n.text || '').replace(/^#+\s*/gm, '').replace(/[-*] \[[ x]\] /g, '☐ ').trim()
  return t.slice(0, 120) || (hasAudio(n.atts) ? '语音笔记' : '')
}

const title = computed(() => props.note.title || excerpt(props.note).split('\n')[0] || '未命名')
const body = computed(() => {
  const t = excerpt(props.note)
  // 标题已占用首行时，正文去掉重复首行
  return props.note.title ? t : t.split('\n').slice(1).join(' ').trim()
})
</script>

<template>
  <article
    class="mb-2.5 break-inside-avoid cursor-pointer overflow-hidden rounded-xl bg-bg-1 shadow-card transition-transform duration-micro active:scale-[0.97]"
    :class="{ 'opacity-60': note.deleted }"
    @click="emit('open')"
  >
    <!-- 封面：图片自然高度，形成瀑布流感 -->
    <img v-if="cover" :src="cover" alt="" class="w-full" loading="lazy" />

    <div class="p-2.5">
      <h3 class="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-0">
        <component v-if="note.pinned" :is="icons.Pin" :size="12" class="mr-0.5 inline-block align-[-1px] text-brand" />{{ title }}
      </h3>

      <!-- 迷你波形 / 摘要（无封面时多露几行，像小红书的文字卡） -->
      <div v-if="miniPeaks" class="mt-1.5 flex h-4 items-end gap-[2.5px]">
        <span
          v-for="(p, i) in miniPeaks" :key="i"
          class="w-[3px] rounded-full bg-brand-cyan"
          :style="{ height: Math.max(2, p * 16) + 'px', opacity: 0.45 + p * 0.55 }"
        />
      </div>
      <p
        v-else-if="body"
        class="mt-1 text-[12px] leading-[1.45] text-ink-1"
        :class="cover ? 'line-clamp-2' : 'line-clamp-5'"
      >{{ body }}</p>

      <!-- 底部：来源 + 时间 -->
      <div class="mt-2 flex items-center gap-1 text-ink-2">
        <component :is="icons[SRC_ICON[note.source] ?? 'Type']" :size="11" :style="{ color: SRC_HUE[note.source] }" />
        <span class="text-[10px]">{{ showDay ? dayLabel(note.createdAt) + ' ' : '' }}{{ fmtClock(note.createdAt) }}</span>
        <span class="flex-1" />
        <span
          v-if="note.syncState !== 'synced'"
          class="h-1.5 w-1.5 rounded-full bg-warn"
          :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
        />
      </div>
    </div>
  </article>
</template>
