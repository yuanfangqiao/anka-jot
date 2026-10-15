/** video.ts — 视频附件处理：元数据读取 + 封面帧抽取（<video> seek 截帧 → canvas 缩略图）。
 *  无法解码的格式（如桌面 Chrome 遇 iPhone HEVC）降级为无封面，不阻塞导入。
 *  体积上限与服务端 MAX_FILE 对齐；缩略图沿用 ':thumb' 约定，清理/同步逻辑零改动。 */
import { sha256Hex } from './image'

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024 // 100MB，与 server/media.py MAX_FILE 对齐

/** 视频文件判定：mime 优先；部分 WebView/浏览器回传空 mime（.mov 常见），按扩展名兜底 */
export function isVideoFile(f: File): boolean {
  if (f.type) return f.type.startsWith('video/')
  return /\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(f.name)
}

export interface VideoOut {
  duration: number; width: number; height: number
  poster: Blob | null; sha256: string
}

const POSTER_EDGE = 480 // 与 image.ts THUMB_EDGE 一致
const SEEK_SEC = 0.3    // 封面帧位置（避开黑场首帧）

/** 读取元数据 + 抽封面帧；任一步失败都降级（poster=null），不抛错 */
export async function processVideo(src: Blob): Promise<VideoOut> {
  const sha256 = await sha256Hex(src)
  const url = URL.createObjectURL(src)
  try {
    const meta = await loadMeta(url)
    const poster = meta ? await grabFrame(url, meta) : null
    return {
      duration: meta?.duration ?? 0, width: meta?.width ?? 0,
      height: meta?.height ?? 0, poster, sha256,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

interface VideoMeta { duration: number; width: number; height: number }

/** iOS 需 muted + playsinline 才能 programmatic 加载/seek；5s 超时兜底防悬挂 */
function loadMeta(url: string): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'metadata'
    const timer = window.setTimeout(() => resolve(null), 5000)
    const done = (m: VideoMeta | null) => { clearTimeout(timer); resolve(m) }
    v.onloadedmetadata = () => done({
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      width: v.videoWidth, height: v.videoHeight,
    })
    v.onerror = () => done(null)
    v.src = url
  })
}

async function grabFrame(url: string, meta: VideoMeta): Promise<Blob | null> {
  if (!meta.width || !meta.height) return null
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    const timer = window.setTimeout(() => resolve(null), 5000)
    const done = (b: Blob | null) => { clearTimeout(timer); resolve(b) }
    v.onloadeddata = () => {
      v.currentTime = Math.min(SEEK_SEC, (meta.duration || 1) * 0.1)
    }
    v.onseeked = () => {
      try {
        const scale = Math.min(1, POSTER_EDGE / Math.max(meta.width, meta.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(meta.width * scale))
        c.height = Math.max(1, Math.round(meta.height * scale))
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        c.toBlob(b => done(b), 'image/jpeg', 0.7)
      } catch { done(null) }
    }
    v.onerror = () => done(null)
    v.src = url
  })
}
