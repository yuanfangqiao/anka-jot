<script setup lang="ts">
import { computed } from 'vue'
import type { JotNote } from '../host'
import { toast } from '../host'
import { todoStat } from '../lib/todos'
import { toggleCardTodo, todoBusy as busy } from '../state/todoActions'
const props = defineProps<{ note: JotNote; readonly?: boolean }>()
const todos = computed(() => props.note.todos ?? [])
const stat = computed(() => todoStat(todos.value))
async function toggle(id: string) {
  if (props.readonly) return
  try { await toggleCardTodo(props.note, id) }
  catch { toast('事项保存失败，请重试', false) }
}
</script>
<template>
  <div class="jot-comp-todos">
    <div class="jot-comp-todos-head">
      <span class="jot-comp-todos-title">事项</span>
      <span class="jot-comp-todos-count">{{ stat.done }}/{{ stat.total }}</span>
      <span class="jot-comp-todos-bar"><i :style="{ width: stat.pct + '%' }" /></span>
    </div>
    <div v-for="t in todos.slice(0, 5)" :key="t.id" class="jot-comp-todo" :class="{ 'is-done': t.done }">
      <button type="button" class="jot-comp-todo-box jot-card-check" :aria-label="`${t.done ? '标记未完成' : '标记完成'}：${t.text}`"
        :aria-pressed="t.done" :disabled="busy || readonly" @click.stop="toggle(t.id)">{{ t.done ? '✓' : '' }}</button>
      <span class="jot-comp-todo-text">{{ t.text }}</span>
    </div>
    <div v-if="todos.length > 5" class="jot-comp-todos-more">还有 {{ todos.length - 5 }} 条</div>
  </div>
</template>
