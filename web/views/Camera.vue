<script setup lang="ts">
/** Camera — 屏③：实时取景、连拍、闪光灯/切换相机、扫描模式（参考框 + 拍后 OCR）。
 *  拍完即存：每张快门立即落 IndexedDB（杀进程不丢），完成时统一挂进笔记。 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useUi, type JotAtt, type JotNote } from '../host'
import { pop } from '../lib/nav'
import { attachImage, invalidateCover, newNote, saveDebounced } from '../state/store'
import { blobUrl } from '../lib/db'

const props = defineProps<{ noteId?: string }>()
const emit = defineEmits<{ done: [noteId: string] }>()
const icons = useUi().icons

const video = ref<HTMLVideoElement>()
const error = ref('')
const facing = ref<'environment' | 'user'>('environment')
const torch = ref(false)
const scanMode = ref(false)
/** 镜像预览：默认开（自拍视角更自然）；扫描模式强制关（OCR 需正向文字） */
const mirrored = ref(true)
watch(scanMode, v => { if (v) mirrored.value = false })

/** 移动端走系统原生拍摄（<input capture>）：不做 web 取景，规避 iOS 每次重复授权，画质也更好 */
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const nativeMode = ref(isMobile)
const fileInput = ref<HTMLInputElement>()
const shots = ref<JotAtt[]>([])
const shotThumbs = ref<string[]>([])
watch(shots, async ss => {
  shotThumbs.value = (await Promise.all(ss.slice(-3).map(s => blobUrl(s.id + ':thumb')))).filter(Boolean) as string[]
})
const busy = ref(false)
let stream: MediaStream | null = null
let realNoteId = props.noteId ?? ''

async function openCamera() {
  error.value = ''
  try {
    stream?.getTracks().forEach(t => t.stop())
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing.value, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    if (video.value) { video.value.srcObject = stream; await video.value.play() }
  } catch (e: any) {
    error.value = '无法打开相机：' + (e?.message ?? '权限被拒绝') + '。可改用相册导入。'
  }
}

async function flip() {
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  await openCamera()
}

async function toggleTorch() {
  const track = stream?.getVideoTracks()[0]
  try {
    await (track as any)?.applyConstraints({ advanced: [{ torch: !torch.value }] })
    torch.value = !torch.value
  } catch { /* 设备不支持闪光灯 */ }
}

async function shutter() {
  if (!video.value || busy.value) return
  busy.value = true
  try {
    // 未指定笔记：首张快门时建笔记，但必须等附件落库后再持久化，
    // 否则 persist 判定「空笔记」跳过，touchNote 也查不到 → 整条笔记丢失
    let fresh: JotNote | null = null
    if (!realNoteId) {
      const n = newNote('camera')
      realNoteId = n.id
      fresh = n
    }
    const v = video.value
    const cv = document.createElement('canvas')
    cv.width = v.videoWidth; cv.height = v.videoHeight
    const ctx = cv.getContext('2d')!
    if (mirrored.value) { ctx.translate(cv.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.95))
    if (!blob) return
    const att = await attachImage(realNoteId, blob, scanMode.value)
    if (fresh) saveDebounced(fresh, true)
    shots.value = [...shots.value, att]
  } finally {
    busy.value = false
  }
}

/** 移动端：系统相机拍完回来的文件（可多选/连拍） */
async function pickNative(files: FileList | null) {
  if (!files?.length) return
  busy.value = true
  try {
    let fresh: JotNote | null = null
    if (!realNoteId) {
      const n = newNote('camera')
      realNoteId = n.id
      fresh = n
    }
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      const att = await attachImage(realNoteId, f, scanMode.value)
      shots.value = [...shots.value, att]
    }
    if (fresh && shots.value.length) saveDebounced(fresh, true)
  } finally {
    busy.value = false
  }
}

async function finish() {
  stream?.getTracks().forEach(t => t.stop()); stream = null
  if (realNoteId) {
    invalidateCover(realNoteId)
    emit('done', realNoteId)
    pop()
  } else pop()
}

onMounted(() => {
  if (nativeMode.value) {
    // 直接唤起系统相机；被浏览器拦截时由页面按钮兜底
    requestAnimationFrame(() => { try { fileInput.value?.click() } catch { /* 需用户手势 */ } })
  } else {
    void openCamera()
  }
})
onUnmounted(() => { stream?.getTracks().forEach(t => t.stop()); stream = null })
</script>

<template>
  <div class="absolute inset-0 z-40 flex flex-col bg-black text-white">
    <!-- 顶栏 -->
    <div class="flex items-center justify-between p-4 text-[13px]">
      <button type="button" class="cursor-pointer rounded-full bg-white/15 p-2 backdrop-blur" @click="finish">
        <component :is="icons.X" :size="18" />
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full px-3 py-1.5 text-[12px] backdrop-blur transition-colors"
        :class="scanMode ? 'bg-brand text-white' : 'bg-white/15'"
        @click="scanMode = !scanMode"
      >{{ scanMode ? '扫描模式' : '拍照模式' }}</button>
      <div v-if="!nativeMode" class="flex gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-full p-2 backdrop-blur transition-colors"
          :class="mirrored ? 'bg-brand text-white' : 'bg-white/15'"
          :title="mirrored ? '镜像开：预览与成片左右翻转' : '镜像关'"
          @click="mirrored = !mirrored"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20" /><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" />
          </svg>
        </button>
        <button type="button" class="cursor-pointer rounded-full bg-white/15 p-2 backdrop-blur" @click="toggleTorch">
          <component :is="torch ? icons.Zap : icons.ZapOff" :size="18" />
        </button>
        <button type="button" class="cursor-pointer rounded-full bg-white/15 p-2 backdrop-blur" @click="flip">
          <component :is="icons.RefreshCw" :size="18" />
        </button>
      </div>
    </div>

    <!-- 取景器（桌面）/ 原生拍摄面板（移动端） -->
    <div class="relative min-h-0 flex-1 overflow-hidden">
      <div v-if="nativeMode" class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <component :is="icons.Camera" :size="34" class="text-white/70" />
        <p class="text-[13px] leading-6 text-white/80">
          使用系统相机拍摄{{ scanMode ? '（扫描模式：对齐文档边缘，拍完可提取文字）' : '' }}
        </p>
        <button
          type="button"
          class="cursor-pointer rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black transition-transform active:scale-95"
          @click="fileInput?.click()"
        >打开系统相机</button>
      </div>
      <video v-else ref="video" playsinline muted class="h-full w-full object-cover transition-transform" :style="{ transform: mirrored ? 'scaleX(-1)' : 'none' }" />
      <!-- 扫描参考框（仅实时取景模式） -->
      <div v-if="scanMode && !nativeMode" class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="relative h-[70%] w-[82%] rounded-lg border-2 border-dashed border-[#3ddc84]/80">
          <span class="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl border-l-4 border-t-4 border-[#3ddc84]" />
          <span class="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr border-r-4 border-t-4 border-[#3ddc84]" />
          <span class="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl border-b-4 border-l-4 border-[#3ddc84]" />
          <span class="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br border-b-4 border-r-4 border-[#3ddc84]" />
          <p class="absolute -bottom-8 w-full text-center text-[12px] text-white/80">对齐文档边缘，拍摄后可提取文本</p>
        </div>
      </div>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-black/80 p-8 text-center text-[13px] leading-6">
        {{ error }}
      </div>
    </div>

    <!-- 底栏：缩略图 + 大快门 + 完成（渐变压暗，抬高避开宿主 dock） -->
    <div class="relative z-10 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-8 pt-4">
      <div class="flex h-12 w-16 items-center gap-1 overflow-hidden rounded-lg">
        <img
          v-for="(u, i) in shotThumbs" :key="i" :src="u" alt=""
          class="h-12 w-12 rounded-md object-cover"
        />
        <span v-if="shots.length > 3" class="text-[12px] text-white/80">×{{ shots.length }}</span>
      </div>
      <button
        v-if="nativeMode"
        type="button"
        class="relative h-[72px] w-[72px] cursor-pointer rounded-full border-[5px] border-white transition-transform active:scale-90"
        :class="{ 'pointer-events-none opacity-40': busy }"
        aria-label="打开系统相机"
        @click="fileInput?.click()"
      >
        <span class="absolute inset-[5px] flex items-center justify-center rounded-full bg-white">
          <component :is="icons.Camera" :size="26" class="text-black" />
        </span>
      </button>
      <button
        v-else
        type="button"
        class="relative h-[72px] w-[72px] cursor-pointer rounded-full border-[5px] border-white transition-transform active:scale-90"
        :class="{ 'pointer-events-none opacity-40': busy }"
        aria-label="快门"
        @click="shutter"
      >
        <span class="absolute inset-[5px] rounded-full bg-white" />
      </button>
      <button
        type="button"
        class="w-16 cursor-pointer rounded-full bg-brand px-3 py-2 text-[13px] font-medium disabled:opacity-40"
        :disabled="!shots.length"
        @click="finish"
      >完成</button>
    </div>

    <!-- 移动端：系统相机入口（capture=environment 直接唤起后摄） -->
    <input
      ref="fileInput" type="file" accept="image/*" capture="environment" multiple class="hidden"
      @change="pickNative(($event.target as HTMLInputElement).files)"
    />
  </div>
</template>
