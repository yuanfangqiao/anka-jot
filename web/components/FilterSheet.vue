<script setup lang="ts">
/** FilterSheet — 首页筛选弹层：全部 / 收藏 / 标签。
 *  受控组件：筛选状态仍由 Home 持有，弹层只发 change 补丁，避免两处真相。
 *  应用内 absolute 定位（不 Teleport 到宿主 body，避免沉到 dock 之下）。 */
import { computed } from 'vue'
import { useUi, type JotTag } from '../host'
import { useBack } from '../lib/useBack'

const props = defineProps<{ tags: JotTag[]; activeTag: string; favOnly: boolean }>()
const emit = defineEmits<{
  /** 单事件回传补丁：自定义事件名不带冒号，避免 kebab/camel 监听名不匹配 */
  change: [patch: { activeTag?: string; favOnly?: boolean }]
  close: []
}>()
const icons = useUi().icons
useBack(() => true, () => emit('close'))

/** 与首页原筛选行一致：最多展示 12 个常用标签 */
const shownTags = computed(() => props.tags.slice(0, 12))
const dirty = computed(() => Boolean(props.activeTag) || props.favOnly)

const pill = 'shrink-0 cursor-pointer rounded-full px-3 py-1.5 jot-fs-12 transition-colors'
const on = 'bg-brand text-white'
const off = 'bg-bg-2 text-ink-1'

function pickTag(name: string) {
  emit('change', { activeTag: props.activeTag === name ? '' : name })
}
function reset() {
  emit('change', { activeTag: '', favOnly: false })
}
</script>

<template>
  <div
    class="absolute inset-0 z-50 flex items-end justify-center bg-black/45 jot-overlay-blur"
    @click="emit('close')"
  >
    <div
      class="jot-sheet-maxh w-full max-w-md animate-fade-up overflow-y-auto rounded-t-shell bg-bg-1 p-4 jot-safe-bottom"
      @click.stop
    >
      <div class="mb-3 flex items-center justify-between">
        <p class="jot-fs-15 font-semibold text-ink-0">筛选</p>
        <button type="button" class="jot-icon-btn" aria-label="关闭" @click="emit('close')">
          <component :is="icons.X" :size="18" />
        </button>
      </div>

      <p class="mb-2 jot-fs-115 font-medium text-ink-2">范围</p>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" :class="[pill, !favOnly ? on : off]" @click="emit('change', { favOnly: false })">全部</button>
        <button type="button" :class="[pill, favOnly ? on : off]" @click="emit('change', { favOnly: !favOnly })">
          <span class="inline-flex items-center gap-1">
            <component :is="icons.Star" :size="12" :fill="favOnly ? 'currentColor' : 'none'" />收藏
          </span>
        </button>
      </div>

      <template v-if="shownTags.length">
        <p class="mb-2 mt-4 jot-fs-115 font-medium text-ink-2">标签</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in shownTags" :key="t.name" type="button"
            :class="[pill, activeTag === t.name ? on : off]"
            @click="pickTag(t.name)"
          >{{ t.name }}</button>
        </div>
      </template>

      <button
        v-if="dirty" type="button"
        class="mt-4 w-full cursor-pointer rounded-xl bg-bg-2 py-2.5 jot-fs-13 text-ink-1"
        @click="reset"
      >清除筛选</button>
    </div>
  </div>
</template>
