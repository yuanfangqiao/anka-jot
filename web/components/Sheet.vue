<script setup lang="ts">
/** Sheet — 「＋」四入口动作面板：文本 / 拍照 / 相册 / 语音。 */
import { useUi } from '../host'
import { useBack } from '../lib/useBack'

const emit = defineEmits<{ pick: [kind: 'text' | 'camera' | 'album' | 'voice']; close: [] }>()
const icons = useUi().icons
useBack(() => true, () => emit('close'))

const ITEMS = [
  { kind: 'text', label: '文本', desc: '打开即记', icon: 'Type', hue: '#5E9B74' },
  { kind: 'camera', label: '拍照', desc: '拍完即存', icon: 'Camera', hue: '#E0A53E' },
  { kind: 'album', label: '相册', desc: '多选导入', icon: 'Images', hue: '#6B8FC4' },
  { kind: 'voice', label: '语音', desc: '说完出字', icon: 'Mic', hue: '#8B7BD8' },
] as const
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 jot-overlay-blur" @click="emit('close')">
      <div class="w-full max-w-md animate-fade-up p-4 jot-safe-bottom" @click.stop>
        <div class="jot-grid-4 rounded-shell bg-bg-1 p-3 shadow-card">
          <button
            v-for="it in ITEMS" :key="it.kind" type="button"
            class="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-3 transition-colors hover:bg-glass active:bg-glass"
            @click="emit('pick', it.kind as any); emit('close')"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-full text-white"
              :style="{ background: it.hue, boxShadow: `0 6px 16px -6px ${it.hue}90` }"
            >
              <component :is="icons[it.icon]" :size="21" />
            </span>
            <span class="jot-fs-13 font-medium text-ink-0">{{ it.label }}</span>
            <span class="jot-fs-10 text-ink-2">{{ it.desc }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
