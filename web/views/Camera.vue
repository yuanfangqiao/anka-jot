<script setup lang="ts">
/** Camera — 屏③：实时取景、连拍、闪光灯/切换相机、扫描模式（参考框 + 拍后 OCR）。
 *  拍完即存：每张快门立即落 IndexedDB（杀进程不丢），完成时统一挂进笔记。 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useUi, type JotAtt, type JotNote } from '../host'
import { pop } from '../lib/nav'
import { attachImage, newNote, saveDebounced, settings } from '../state/store'
import { blobUrl } from '../lib/db'

const props = defineProps<{ noteId?: string }>()
const emit = defineEmits<{ done: [noteId: string] }>()
const icons = useUi().icons

const video = ref<HTMLVideoElement>()
const error = ref('')
const facing = ref<'environment' | 'user'>('environment')
const torch = ref(false)
const scanMode = ref(false)
/** 镜像：只跟镜头走 —— 前置（user）翻转成自拍镜面，后置（environment）保持原样；
 *  扫描模式强制关（OCR 需正向文字），设置里可整体关掉自拍镜像 */
const mirrored = computed(() =>
  settings.selfieMirror && facing.value === 'user' && !scanMode.value)

/** 移动端可走系统原生拍摄（<input capture>）：无网页授权、画质更好。
 *  真机判定：移动 UA 且无桌面插件——桌面 Chrome 设备模拟会伪造 UA，但 plugins
 *  仍是桌面那套（PDF 等 >0 个），借此区分「真机」与「模拟器」，
 *  避免开发态在桌面误入原生模式弹出文件选择器 */
function likelyRealMobile(): boolean {
  if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return false
  return (navigator.plugins?.length ?? 0) === 0
}
const nativeMode = ref(likelyRealMobile())
const fileInput = ref<HTMLInputElement>()
const shots = ref<JotAtt[]>([])
const shotThumbs = ref<string[]>([])
watch(shots, async ss => {
  shotThumbs.value = (await Promise.all(ss.slice(-3).map(async s => (await blobUrl(s.id)) ?? blobUrl(s.id + ':thumb')))).filter(Boolean) as string[]
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
    // 真机取景失败（未授权/无摄像头）→ 自动降级原生拍摄；桌面仅提示
    if (likelyRealMobile()) { nativeMode.value = true; return }
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
    emit('done', realNoteId)
    pop()
  } else pop()
}

/** 切换拍摄模式：原生（系统相机，无网页授权）/ 实时取景（getUserMedia） */
function useNative() { nativeMode.value = true; error.value = '' }
function useLive() { nativeMode.value = false; error.value = ''; void openCamera() }

onMounted(() => {
  // 默认实时取景；真机上想免重复授权可切「原生拍摄」。
  // 注意：Chrome 设备模拟会伪造移动端 UA，故不用 UA 自动判定模式，仅作为初始默认值
  if (!nativeMode.value) void openCamera()
})
onUnmounted(() => { stream?.getTracks().forEach(t => t.stop()); stream = null })
</script>

<template>
  <div class="absolute inset-0 z-40 flex flex-col bg-black text-white">
    <!-- 顶栏 -->
    <div class="flex items-center justify-between p-4 jot-fs-13">
      <button type="button" class="cursor-pointer rounded-full bg-white/15 p-2 backdrop-blur" @click="finish">
        <component :is="icons.X" :size="18" />
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full px-3 py-1.5 jot-fs-12 backdrop-blur transition-colors"
        :class="scanMode ? 'bg-brand text-white' : 'bg-white/15'"
        @click="scanMode = !scanMode"
      >{{ scanMode ? '扫描模式' : '拍照模式' }}</button>
      <div v-if="!nativeMode" class="flex gap-2">
        <button
          v-if="likelyRealMobile()"
          type="button"
          class="cursor-pointer rounded-full bg-white/15 px-3 py-1.5 jot-fs-12 backdrop-blur"
          title="改用系统相机拍摄（免网页授权）"
          @click="useNative"
        >原生拍摄</button>
        <span
          v-if="mirrored"
          class="flex items-center rounded-full bg-brand px-2.5 py-1.5 jot-fs-11 text-white backdrop-blur"
          title="前置自拍：预览与成片按镜子左右翻转"
        >镜像</span>
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
        <p class="jot-fs-13 leading-6 text-white/80">
          使用系统相机拍摄{{ scanMode ? '（扫描模式：对齐文档边缘，拍完可提取文字）' : '' }}
        </p>
        <button
          type="button"
          class="cursor-pointer rounded-full bg-white px-5 py-2.5 jot-fs-13 font-medium text-black transition-transform active:scale-95"
          @click="fileInput?.click()"
        >打开系统相机</button>
        <button
          type="button"
          class="cursor-pointer rounded-full bg-white/15 px-4 py-2 jot-fs-12 text-white/90 backdrop-blur transition-transform active:scale-95"
          @click="useLive"
        >改用实时取景</button>
      </div>
      <video v-else ref="video" playsinline muted class="h-full w-full object-cover transition-transform" :style="{ transform: mirrored ? 'scaleX(-1)' : 'none' }" />
      <!-- 扫描参考框（仅实时取景模式） -->
      <div v-if="scanMode && !nativeMode" class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="jot-scan-frame">
          <span class="jot-scan-corner jot-scan-corner-tl" />
          <span class="jot-scan-corner jot-scan-corner-tr" />
          <span class="jot-scan-corner jot-scan-corner-bl" />
          <span class="jot-scan-corner jot-scan-corner-br" />
          <p class="absolute -bottom-8 w-full text-center jot-fs-12 text-white/80">对齐文档边缘，拍摄后可提取文本</p>
        </div>
      </div>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-black/80 p-8 text-center jot-fs-13 leading-6">
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
        <span v-if="shots.length > 3" class="jot-fs-12 text-white/80">×{{ shots.length }}</span>
      </div>
      <button
        v-if="nativeMode"
        type="button"
        class="jot-shutter jot-shutter-native"
        :class="{ 'pointer-events-none opacity-40': busy }"
        aria-label="打开系统相机"
        @click="fileInput?.click()"
      >
        <span class="jot-shutter-inner">
          <component :is="icons.Camera" :size="26" />
        </span>
      </button>
      <button
        v-else
        type="button"
        class="jot-shutter"
        :class="{ 'pointer-events-none opacity-40': busy }"
        aria-label="快门"
        @click="shutter"
      >
        <span class="jot-shutter-inner" />
      </button>
      <button
        type="button"
        class="w-16 cursor-pointer rounded-full bg-brand px-3 py-2 jot-fs-13 font-medium disabled:opacity-40"
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
