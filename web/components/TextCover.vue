<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { JotNote } from '../host'
import { hashCardColor } from '../lib/color'

const props = defineProps<{ note: JotNote; text: string }>()
const content = ref<HTMLElement>()
const heading = ref<HTMLElement>()
const body = ref<HTMLElement>()
const lines = ref(1)
const title = computed(() => props.note.title.trim())
const short = computed(() => [...(title.value + props.text)].length <= 32)
const style = computed(() => ({ ...hashCardColor(title.value || props.text), '--cover-lines': lines.value }))
let observer: ResizeObserver | undefined
let alive = true
function fit() {
  if (!content.value || !body.value) return
  const titleStyle = heading.value && getComputedStyle(heading.value)
  const titleHeight = heading.value
    ? heading.value.getBoundingClientRect().height + parseFloat(titleStyle?.marginBottom || '0') : 0
  const lineHeight = parseFloat(getComputedStyle(body.value).lineHeight)
  lines.value = Math.max(1, Math.floor((content.value.clientHeight - titleHeight) / lineHeight))
}
watch(() => [title.value, props.text, short.value], () => nextTick(fit), { flush: 'post' })
onMounted(() => {
  observer = new ResizeObserver(fit)
  if (content.value) observer.observe(content.value)
  void nextTick(fit)
  void document.fonts?.ready.then(() => { if (alive) fit() })
})
onBeforeUnmount(() => { alive = false; observer?.disconnect() })
</script>

<template>
  <div class="jot-textcard jot-text-cover" :class="{ 'is-short': short, 'is-body-only': !title }" :style="style">
    <div ref="content" class="jot-cover-content">
      <p v-if="title" ref="heading" class="jot-cover-heading">{{ title }}</p>
      <p v-if="text || !title" ref="body" class="jot-cover-body">{{ text || '·' }}</p>
    </div>
    <slot />
  </div>
</template>
