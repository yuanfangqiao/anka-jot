/** image.ts — 图片管线：压缩（≤2048px）、缩略图（480px）、sha256。canvas 手写，零依赖。 */

export interface ImageOut {
  full: Blob; thumb: Blob | null; width: number; height: number
  mime: string; sha256: string
}

const MAX_EDGE = 2048
const THUMB_EDGE = 480
const Q_FULL = 0.82
const Q_THUMB = 0.7

async function toBitmap(src: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(src) } catch { /* Safari 老版本回退 */ }
  const url = URL.createObjectURL(src)
  try {
    return await new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img); img.onerror = rej; img.src = url
    })
  } finally { /* objectURL 在 canvas 绘制后即可释放，此处保留由调用方兜底 */ }
}

function drawScaled(bmp: ImageBitmap | HTMLImageElement, maxEdge: number, q: number): Promise<{ blob: Blob; w: number; h: number }> {
  const w0 = 'width' in bmp ? bmp.width : 0
  const h0 = 'height' in bmp ? bmp.height : 0
  const scale = Math.min(1, maxEdge / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  g.drawImage(bmp, 0, 0, w, h)
  return new Promise((res, rej) =>
    cv.toBlob(b => b ? res({ blob: b, w, h }) : rej(new Error('toBlob 失败')), 'image/jpeg', q))
}

export async function sha256Hex(b: Blob): Promise<string> {
  const buf = await b.arrayBuffer()
  const dig = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(dig)].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** 相机/相册入口统一走这里：产出 full+thumb 与元数据 */
export async function processImage(src: Blob): Promise<ImageOut> {
  const bmp = await toBitmap(src)
  const full = await drawScaled(bmp, MAX_EDGE, Q_FULL)
  // 缩略图只是优化：生成失败也必须保存并展示大图。
  const thumb = await drawScaled(bmp, THUMB_EDGE, Q_THUMB).catch(() => null)
  if ('close' in bmp) (bmp as ImageBitmap).close()
  return { full: full.blob, thumb: thumb?.blob ?? null, width: full.w, height: full.h, mime: 'image/jpeg', sha256: await sha256Hex(full.blob) }
}

/** Blob → base64（分块上传用） */
export async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode(...buf.subarray(i, i + CH))
  return btoa(s)
}
