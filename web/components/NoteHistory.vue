<script setup lang="ts">
import { ref } from 'vue'
import { callJot, toast, type JotNote } from '../host'
import * as db from '../lib/db'
import { content, copy } from '../lib/noteMerge'
import { flushSave } from '../state/store'
const props = defineProps<{ note: JotNote }>()
const emit = defineEmits<{ restored: [] }>()
const open = ref(false)
const loading = ref(false)
const error = ref('')
const versions = ref<{ at: number; snap: JotNote; reason?: string }[]>([])
async function load() {
  open.value = !open.value
  if (!open.value) return
  loading.value = true
  error.value = ''
  try {
    const local = await db.noteHistory(props.note.id)
    let remote = []
    try { remote = await callJot('note_history', { id: props.note.id }) }
    catch { error.value = '远端历史暂不可用，当前显示本机版本。' }
    const seen = new Set<string>()
    versions.value = [...local, ...remote].sort((a, b) => b.at - a.at).filter(v => {
      const key = JSON.stringify(content(v.snap))
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  } catch { error.value = '历史读取失败，请重新打开重试。' }
  finally { loading.value = false }
}
async function restore(snap: JotNote) {
  await db.putHistory(props.note)
  // Restore content, keeping identity, attachments and the current synchronization base.
  for (const key of ['title', 'text', 'tags', 'todos', 'todo', 'pinned', 'fav', 'color'] as const) {
    if (key in snap) (props.note as any)[key] = copy(snap[key])
  }
  await flushSave(props.note)
  emit('restored')
  open.value = false
  toast('已恢复此版本，恢复前内容仍保留在历史中')
}
</script>
<template>
  <section class="jot-history">
    <button type="button" class="jot-ai-chip" :aria-expanded="open" @click="load">历史版本</button>
    <div v-if="open" class="jot-history-list">
      <p v-if="loading" role="status">读取中…</p>
      <p v-if="error" role="status">{{ error }}</p>
      <p v-if="!loading && !versions.length">还没有历史版本</p>
      <article v-for="(v, i) in versions" :key="i" class="jot-history-item">
        <p>{{ new Date(v.at).toLocaleString() }} · {{ v.reason || '历史版本' }}</p>
        <strong>{{ v.snap.title || '无标题' }}</strong>
        <p class="jot-history-text">{{ v.snap.text }}</p>
        <button type="button" class="jot-ai-chip" @click="restore(v.snap)">恢复此版本</button>
      </article>
    </div>
  </section>
</template>
