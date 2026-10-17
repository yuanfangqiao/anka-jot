<script setup lang="ts">
/** Settings — 我的：采集开关、存储用量、导出、后端状态、关于。 */
import { onMounted, ref } from 'vue'
import { callJot, useUi } from '../host'
import { allAtts, kvSet, listNotes, usage } from '../lib/db'
import { syncNow, syncState } from '../lib/sync'
import { settings, notes } from '../state/store'
import OfflineBanner from '../components/OfflineBanner.vue'

const icons = useUi().icons
const used = ref('—')
const exporting = ref(false)
const serverRev = ref<number | null>(null)

onMounted(async () => {
  used.value = await usage()
  try { serverRev.value = (await callJot('stats'))?.serverRev ?? null } catch { serverRev.value = null }
})

async function toggleLocation() {
  settings.locationOn = !settings.locationOn
  await kvSet('locationOn', settings.locationOn)
}
async function toggleSelfieMirror() {
  settings.selfieMirror = !settings.selfieMirror
  await kvSet('selfieMirror', settings.selfieMirror)
}
async function setLang(e: Event) {
  settings.lang = (e.target as HTMLSelectElement).value
  await kvSet('lang', settings.lang)
}

async function exportJson() {
  exporting.value = true
  try {
    const data = {
      app: 'anka-jot', version: '0.1.0', exportedAt: new Date().toISOString(),
      notes: (await listNotes()).map(n => ({ ...n, syncState: undefined })),
      atts: (await allAtts()).map(a => ({ ...a, serverPath: a.serverPath ?? null })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `jot-export-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  } finally { exporting.value = false }
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 pb-28 pt-4">
    <h1 class="px-1 jot-fs-22 font-bold">我的</h1>

    <section class="rounded-card bg-bg-1 p-4 shadow-card">
      <p class="mb-3 jot-fs-12 font-semibold text-ink-1">采集</p>
      <div class="flex items-center justify-between py-1.5">
        <div>
          <p class="jot-fs-14 text-ink-0">记录位置</p>
          <p class="jot-fs-115 text-ink-2">新笔记自动附带当前位置（用于智能相册）</p>
        </div>
        <button
          type="button" class="h-7 w-12 cursor-pointer rounded-full p-0.5 transition-colors"
          :class="settings.locationOn ? 'bg-brand' : 'bg-bg-2'"
          @click="toggleLocation"
        >
          <span class="block h-6 w-6 rounded-full bg-white shadow transition-transform" :class="{ 'translate-x-5': settings.locationOn }" />
        </button>
      </div>
      <div class="flex items-center justify-between py-1.5">
        <div>
          <p class="jot-fs-14 text-ink-0">自拍镜像</p>
          <p class="jot-fs-115 text-ink-2">前置摄像头成片左右翻转，后置保持原样</p>
        </div>
        <button
          type="button" class="h-7 w-12 cursor-pointer rounded-full p-0.5 transition-colors"
          :class="settings.selfieMirror ? 'bg-brand' : 'bg-bg-2'"
          @click="toggleSelfieMirror"
        >
          <span class="block h-6 w-6 rounded-full bg-white shadow transition-transform" :class="{ 'translate-x-5': settings.selfieMirror }" />
        </button>
      </div>
      <div class="flex items-center justify-between py-1.5">
        <div>
          <p class="jot-fs-14 text-ink-0">转写语言</p>
          <p class="jot-fs-115 text-ink-2">语音实时转写使用的语言</p>
        </div>
        <select
          :value="settings.lang"
          class="cursor-pointer rounded-lg bg-bg-2 px-2 py-1.5 jot-fs-13 text-ink-0 outline-none"
          @change="setLang"
        >
          <option value="zh-CN">中文（普通话）</option>
          <option value="en-US">English (US)</option>
          <option value="ja-JP">日本語</option>
        </select>
      </div>
    </section>

    <section class="rounded-card bg-bg-1 p-4 shadow-card">
      <p class="mb-3 jot-fs-12 font-semibold text-ink-1">数据</p>
      <!-- 同步异常/待同步详情只在这里出现，首页不再占一行 -->
      <OfflineBanner class="mb-2" />
      <div class="flex items-center justify-between py-1.5 jot-fs-14">
        <span class="text-ink-0">本地存储</span>
        <span class="text-ink-2">{{ used }} · {{ notes.length }} 条笔记</span>
      </div>
      <div class="flex items-center justify-between py-1.5 jot-fs-14">
        <span class="text-ink-0">同步状态</span>
        <button type="button" class="cursor-pointer text-brand disabled:opacity-50" :disabled="syncState.syncing" @click="syncNow">
          {{ syncState.syncing ? '同步中…' : syncState.pending ? `${syncState.pending} 项待同步` : '已同步' }}
        </button>
      </div>
      <div class="flex items-center justify-between py-1.5 jot-fs-14">
        <span class="text-ink-0">导出 JSON</span>
        <button
          type="button" class="flex cursor-pointer items-center gap-1 text-brand disabled:opacity-50"
          :disabled="exporting" @click="exportJson"
        >
          <component :is="icons.Download" :size="14" />导出
        </button>
      </div>
    </section>

    <section class="rounded-card bg-bg-1 p-4 shadow-card">
      <p class="mb-2 jot-fs-12 font-semibold text-ink-1">关于</p>
      <p class="jot-fs-13 leading-6 text-ink-1">
        即刻 Jot v0.1.0 · 打开即记、拍完即存、说完出字、事后好找。<br />
        数据保存在本机 IndexedDB 与自建服务端，未经您的网络不出机。
      </p>
    </section>
  </div>
</template>
