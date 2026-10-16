/** 视频封面由浏览器先抽取；无法解码的格式交给服务端 FFmpeg 补生成。 */
import { sha256Hex } from './image'

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024
export function isVideoFile(f: File): boolean {
  if (f.type) return f.type.startsWith('video/')
  return /\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(f.name)
}
export interface VideoOut {
  duration: number; width: number; height: number
  poster: Blob | null; sha256: string
}
type Preview = Omit<VideoOut, 'sha256'>
const EDGE = 480

/** 一个 video 完成元数据/seek/截帧；结束与超时都释放解码器，不留后台加载。 */
function inspectVideo(src: Blob): Promise<Preview> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(src)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    let finished = false
    let capturing = false
    let sought = false
    const meta = { duration: 0, width: 0, height: 0 }
    const done = (poster: Blob | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve({ ...meta, poster })
    }
    const timer = window.setTimeout(() => done(null), 8000)
    function capture() {
      if (finished || capturing || !meta.width || !meta.height) return
      capturing = true
      try {
        const scale = Math.min(1, EDGE / Math.max(meta.width, meta.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(meta.width * scale))
        canvas.height = Math.max(1, Math.round(meta.height * scale))
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(done, 'image/jpeg', 0.7)
      } catch { done(null) }
    }
    video.onloadedmetadata = () => {
      meta.duration = Number.isFinite(video.duration) ? video.duration : 0
      meta.width = video.videoWidth
      meta.height = video.videoHeight
    }
    video.onloadeddata = () => {
      if (sought) return
      sought = true
      const target = Math.min(0.3, meta.duration * 0.1)
      if (target <= 0 || Math.abs(video.currentTime - target) < 0.001) capture()
      else video.currentTime = target
    }
    video.onseeked = capture
    video.onerror = () => done(null)
    video.src = url
    video.load()
  })
}
export async function createVideoThumbnail(src: Blob): Promise<Blob | null> {
  return (await inspectVideo(src)).poster
}
export async function processVideo(src: Blob): Promise<VideoOut> {
  const sha256 = await sha256Hex(src)
  return { ...(await inspectVideo(src)), sha256 }
}
