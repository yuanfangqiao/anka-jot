<script setup lang="ts">
/** CardFoot — 卡片底部信息行：左侧置顶/收藏/同步点 + 时间（+标题），右侧「⋯」快速菜单。
 *  ⋯ 只写 state/menu，面板由 App 根部渲染，卡片自身 overflow:hidden 不会裁掉它。 */
import { useUi, type JotNote } from '../host'
import { openCardMenu } from '../state/menu'

defineProps<{
  note: JotNote
  time?: string
  title?: string
  /** 待办进度（有待办才传），卡片上给一眼可读的 n/m */
  todo?: { done: number; total: number } | null
  /** 只读：不渲染「⋯」（日历卡片是服务端投影，不能直接走本地写路径） */
  readonly?: boolean
}>()
const icons = useUi().icons
</script>

<template>
  <div class="jot-card-foot">
    <span class="jot-card-meta">
      <component :is="icons.Star" v-if="note.fav" :size="11" class="jot-fav-mini" fill="currentColor" />
      <span v-if="note.todo" class="jot-todo-mini" title="待办笔记">
        <component :is="icons.ListChecks" :size="11" />
      </span>
      <span
        v-if="note.syncState !== 'synced'"
        class="jot-sync-dot"
        :title="note.syncState === 'syncing' ? '同步中' : '已本地保存'"
      />
      <span v-if="todo" class="jot-card-todo" :class="{ 'is-all': todo.done === todo.total }">
        <component :is="icons.ListChecks" :size="11" />{{ todo.done }}/{{ todo.total }}
      </span>
      <span v-if="time" class="jot-card-time">{{ time }}</span>
      <span v-if="title" class="jot-card-title">{{ title }}</span>
    </span>
    <button
      v-if="!readonly"
      type="button" class="jot-more" aria-label="更多操作" title="更多操作"
      @click.stop="openCardMenu(note)"
    >
      <span class="jot-dots"><i /><i /><i /></span>
    </button>
  </div>
</template>
