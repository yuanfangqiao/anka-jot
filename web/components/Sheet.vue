<script setup lang="ts">
/** Sheet — 「＋」四入口动作面板：文本 / 拍照 / 相册 / 语音。 */
import { useUi } from '../host'

const emit = defineEmits<{ pick: [kind: 'text' | 'camera' | 'album' | 'voice']; close: [] }>()
const icons = useUi().icons

const ITEMS = [
  { kind: 'text', label: '文本', desc: '打开即记', icon: 'Type', hue: '#5E9B74' },
  { kind: 'camera', label: '拍照', desc: '拍完即存', icon: 'Camera', hue: '#E0A53E' },
  { kind: 'album', label: '相册', desc: '多选导入', icon: 'Images', hue: '#6B8FC4' },
  { kind: 'voice', label: '语音', desc: '说完出字', icon: 'Mic', hue: '#8B7BD8' },
] as const
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]" @click="emit('close')">
      <div class="w-full max-w-md animate-fade-up p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" @click.stop>
        <div class="grid grid-cols-4 gap-2 rounded-shell bg-bg-1 p-3 shadow-card">
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
            <span class="text-[13px] font-medium text-ink-0">{{ it.label }}</span>
            <span class="text-[10px] text-ink-2">{{ it.desc }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
