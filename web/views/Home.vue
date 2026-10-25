<script setup lang="ts">
defineOptions({ name: 'Home' })
import { useViewScroll } from '../lib/useViewScroll'
/** Home — 屏①：搜索 + 筛选、置顶横滑条、时间线卡片流、底部细长五入口工具条。 */
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useUi, type JotNote } from '../host'
import { push } from '../lib/nav'
import { pinnedNotes, sortedNotes, tags } from '../state/store'
import { dayLabelFull, sameDay } from '../lib/format'
import NoteCard from '../components/NoteCard.vue'
import Empty from '../components/Empty.vue'
import FilterSheet from '../components/FilterSheet.vue'
import { usePullRefresh } from '../lib/usePullRefresh'
import { useColCount, splitCols } from '../lib/useColCount'

const emit = defineEmits<{ create: [kind: 'text' | 'camera' | 'video' | 'album' | 'voice'] }>()
const icons = useUi().icons
const list = ref<HTMLElement | null>(null)
useViewScroll(list)
const { distance, refreshing, label } = usePullRefresh(list)

const tagColorMap = computed(() => Object.fromEntries(tags.value.map(t => [t.name, t.color])))

/** 置顶条：store 已按「最新置顶」倒序排好（最多 10 条），最新在最左 */
const pinned = pinnedNotes
const flow = computed(() => sortedNotes.value.filter(n => !n.pinned))

/** 置顶条：卡片宽度对齐时间线单列，超出可视区才给左右箭头（>2 张） */
const shelf = ref<HTMLElement | null>(null)
const shelfEdge = ref({ left: false, right: false })
function syncShelfEdge() {
  const el = shelf.value
  if (!el) { shelfEdge.value = { left: false, right: false }; return }
  const max = el.scrollWidth - el.clientWidth
  shelfEdge.value = { left: el.scrollLeft > 1, right: max > 1 && el.scrollLeft < max - 1 }
}
function scrollShelf(dir: -1 | 1) {
  const el = shelf.value
  if (!el) return
  const first = el.firstElementChild as HTMLElement | null
  el.scrollBy({ left: dir * ((first?.offsetWidth ?? el.clientWidth * 0.8) + 10), behavior: 'smooth' })
}
watch(pinned, () => nextTick(syncShelfEdge), { flush: 'post' })
onActivated(() => nextTick(syncShelfEdge))

/** 五入口：细长工具条；每格一个深色瓷贴（藏蓝/墨绿/靛紫/赭橙/酒红），样式见 jot-bar-item-* */
const QUICK = [
  { kind: 'text', icon: 'Type', label: '文字' },
  { kind: 'camera', icon: 'Camera', label: '拍照' },
  { kind: 'video', icon: 'Video', label: '录像' },
  { kind: 'album', icon: 'Images', label: '相册' },
  { kind: 'voice', icon: 'Mic', label: '录音' },
] as const

function open(n: JotNote) { push('note', { id: n.id }) }

// @标签快捷过滤 + 收藏筛选（两者可叠加），入口收在搜索框右侧的筛选弹层
const activeTag = ref('')
const favOnly = ref(false)
const filterOpen = ref(false)
const visibleFlow = computed(() => flow.value.filter(n =>
  (!favOnly.value || n.fav) && (!activeTag.value || n.tags.includes(activeTag.value))))
/** KeepAlive 缓存页面：离开时收掉弹层，回来不残留遮罩 */
onDeactivated(() => { filterOpen.value = false })

/** 弹层回传筛选补丁（只带变化的字段，避免覆盖另一项） */
function applyFilter(patch: { activeTag?: string; favOnly?: boolean }) {
  if (patch.activeTag !== undefined) activeTag.value = patch.activeTag
  if (patch.favOnly !== undefined) favOnly.value = patch.favOnly
}

/** 响应式列数（与收藏页共用 lib/useColCount） */
const colCount = useColCount()
/** 置顶卡宽度 = 时间线单列宽度（gap 10px 与 .jot-cols 一致） */
const shelfItemW = computed(() => `calc((100% - ${(colCount.value - 1) * 10}px) / ${colCount.value})`)
watch(colCount, () => nextTick(syncShelfEdge))
onMounted(() => window.addEventListener('resize', syncShelfEdge))
onBeforeUnmount(() => window.removeEventListener('resize', syncShelfEdge))

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
</script>

<template>
  <div class="jot-home">
    <!-- 滚动区（底部留白避让悬浮胶囊工具条） -->
    <div ref="list" class="jot-container jot-refresh-list jot-scroll-pad flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
      <div v-if="distance || refreshing" class="jot-refresh-status" role="status"
        :style="{ height: distance + 'px', lineHeight: distance + 'px' }">{{ label }}</div>
      <!-- 搜索行：搜索框 + 筛选按钮（筛选收进底部弹层，首页更干净） -->
      <div class="jot-search-row">
        <button
          type="button"
          class="jot-search flex cursor-text items-center gap-2 rounded-full bg-bg-1 px-4 py-2.5 text-left jot-fs-13 text-ink-2 shadow-card"
          @click="push('search')"
        >
          <component :is="icons.Search" :size="15" class="shrink-0" />
          <span class="truncate">搜索文字、语音、OCR…</span>
        </button>
        <button
          type="button"
          class="jot-filter-btn shadow-card"
          :class="{ 'is-on': favOnly || Boolean(activeTag) }"
          aria-label="筛选"
          @click="filterOpen = true"
        >
          <component :is="icons.ListFilter" :size="16" />
        </button>
      </div>

      <!-- 置顶：横滑条，卡片与时间线同尺寸；超出可视区且 >2 张时给左右箭头 -->
      <section v-if="pinned.length" class="jot-pin-block">
        <div class="jot-date-sep"><span class="jot-date-sep-label">置顶</span></div>
        <div class="jot-shelf-wrap">
          <button
            v-if="shelfEdge.left"
            type="button"
            class="jot-shelf-nav is-left"
            aria-label="向左查看更多置顶"
            @click="scrollShelf(-1)"
          >
            <component :is="icons.ChevronLeft" :size="15" />
          </button>
          <div ref="shelf" class="jot-shelf" :style="{ '--shelf-item-w': shelfItemW }" @scroll.passive="syncShelfEdge">
            <div v-for="n in pinned" :key="n.id" class="jot-shelf-item">
              <NoteCard :note="n" :tag-colors="tagColorMap" :show-day="false" @open="open(n)" />
            </div>
          </div>
          <button
            v-if="shelfEdge.right"
            type="button"
            class="jot-shelf-nav is-right"
            aria-label="向右查看更多置顶"
            @click="scrollShelf(1)"
          >
            <component :is="icons.ChevronRight" :size="15" />
          </button>
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
    <Empty
      v-else-if="!pinned.length && !visibleFlow.length"
      :icon="favOnly ? 'Star' : 'SearchX'"
      :title="favOnly ? '还没有收藏的笔记' : '没有匹配的笔记'"
      :hint="favOnly ? '进笔记详情点星标即可收藏' : '换个标签试试'"
    />
    </div>

    <!-- 五入口：保留底部玻璃栏；电脑用紧凑图文按钮，手机保留圆形图标 -->
    <footer class="jot-bar-wrap">
      <div class="jot-bar jot-container">
        <button
          v-for="q in QUICK" :key="q.kind" type="button"
          class="jot-bar-item"
          :class="`jot-bar-item-${q.kind}`"
          :aria-label="q.label" :title="q.label"
          @click="emit('create', q.kind)"
        >
          <span class="jot-bar-tile">
            <component :is="icons[q.icon]" :size="22" :stroke-width="1.9" />
          </span>
          <span class="jot-bar-label">{{ q.label }}</span>
        </button>
      </div>
    </footer>

    <!-- 筛选弹层（应用内 absolute，覆盖底部工具条而不沉到宿主 dock 下） -->
    <FilterSheet
      v-if="filterOpen"
      :tags="tags"
      :active-tag="activeTag"
      :fav-only="favOnly"
      @change="applyFilter"
      @close="filterOpen = false"
    />
  </div>
</template>
