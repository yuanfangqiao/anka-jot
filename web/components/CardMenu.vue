<script setup lang="ts">
/** CardMenu — 卡片「⋯」快速菜单（App 级底部面板）：
 *  编辑 / 置顶 / 收藏 / 待办标志 / 删除。操作直接写 store，时间线与收藏页响应式刷新。
 *  应用内 absolute 定位（与 FilterSheet 一致）：Teleport 到宿主 body 会沉到底部 dock 下。 */
import { computed, ref, watch } from 'vue'
import { toast, useUi } from '../host'
import { push } from '../lib/nav'
import { useBack } from '../lib/useBack'
import { closeCardMenu, menuNote } from '../state/menu'
import { removeNote, toggleFav, togglePin, toggleTodoFlag } from '../state/store'

const icons = useUi().icons
const note = computed(() => menuNote.value)
useBack(() => Boolean(menuNote.value), closeCardMenu)

/** 删除二段确认：首次点击只把按钮切成「确认删除」，避免 native confirm 打断体验 */
const armed = ref(false)
watch(note, () => { armed.value = false })

/** 面板顶部标题：优先标题，退回首行正文，语音笔记兜底 */
const heading = computed(() => {
  const n = note.value
  if (!n) return ''
  return (n.title || (n.text || '').split('\n')[0] || '语音笔记').trim().slice(0, 40)
})

function edit() {
  const n = note.value
  closeCardMenu()
  if (n) push('note', { id: n.id })
}

async function pin() {
  const n = note.value
  closeCardMenu()
  if (!n) return
  // 满 10 条时 store 会拒绝并提示，这里不误报「已置顶」
  if (await togglePin(n)) toast(n.pinned ? '已置顶' : '已取消置顶')
}

async function fav() {
  const n = note.value
  closeCardMenu()
  if (!n) return
  await toggleFav(n)
  toast(n.fav ? '已收藏' : '已取消收藏')
}

async function todo() {
  const n = note.value
  closeCardMenu()
  if (!n) return
  await toggleTodoFlag(n)
  toast(n.todo ? '已标记为待办笔记' : '已取消待办标志')
}

async function del() {
  const n = note.value
  if (!n) return
  if (!armed.value) { armed.value = true; return }
  closeCardMenu()
  await removeNote(n)
  toast('已删除')
}
</script>

<template>
  <div
    v-if="note"
    class="jot-menu-layer animate-fade-up"
    @click.self="closeCardMenu"
  >
    <div class="jot-menu-panel" role="menu" @click.stop>
      <p class="jot-menu-head">{{ heading }}</p>

      <button type="button" class="jot-menu-row" role="menuitem" @click="edit">
        <component :is="icons.FileText" :size="19" class="jot-menu-ico" />
        <span>编辑</span>
      </button>
      <button type="button" class="jot-menu-row" role="menuitem" @click="pin">
        <component :is="icons.Pin" :size="19" class="jot-menu-ico" />
        <span>{{ note.pinned ? '取消置顶' : '置顶' }}</span>
      </button>
      <button type="button" class="jot-menu-row" role="menuitem" @click="fav">
        <component :is="icons.Star" :size="19" class="jot-menu-ico" :fill="note.fav ? 'currentColor' : 'none'" />
        <span>{{ note.fav ? '取消收藏' : '收藏' }}</span>
      </button>
      <button type="button" class="jot-menu-row" role="menuitem" @click="todo">
        <component :is="icons.ListChecks" :size="19" class="jot-menu-ico" />
        <span>{{ note.todo ? '取消待办' : '标记待办' }}</span>
      </button>

      <div class="jot-menu-sep" />

      <button
        type="button" class="jot-menu-row is-danger" :class="{ 'is-armed': armed }"
        role="menuitem" @click="del"
      >
        <component :is="icons.Trash2" :size="19" class="jot-menu-ico" />
        <span>{{ armed ? '确认删除？（不可撤销）' : '删除' }}</span>
      </button>
    </div>

    <button type="button" class="jot-menu-cancel" @click="closeCardMenu">取消</button>
  </div>
</template>
