/** audio.ts — MediaRecorder 封装：分片收集（防崩溃丢整段）、
 *  AnalyserNode 实时波形采样、时长/峰值解码。mime 嗅探兼容 Safari。 */

export interface Recording { blob: Blob; mime: string; duration: number; peaks: number[] }

export function pickMime(): string {
  const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg']
  const MR = (window as any).MediaRecorder
  if (!MR) return ''
  return cands.find(c => MR.isTypeSupported?.(c)) ?? ''
}

export class JotRecorder {
  private mr: MediaRecorder | null = null
  private chunks: Blob[] = []
  private ac: AudioContext | null = null
  private stream: MediaStream | null = null
  private t0 = 0
  peaks: number[] = []
  onPeak: ((peaks: number[]) => void) | null = null
  private raf = 0

  static supported(): boolean {
    return Boolean((navigator.mediaDevices as any)?.getUserMedia && (window as any).MediaRecorder)
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = pickMime()
    this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.peaks = []
    this.mr.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data) }
    this.mr.start(1000) // 分片：崩溃最多丢 1s
    this.t0 = Date.now()

    // 实时波形采样（iOS Safari 需 webkitAudioContext 兜底；挂起态要 resume 才有数据）
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      this.ac = new Ctx()
      void this.ac.resume?.().catch(() => {})
      const src = this.ac.createMediaStreamSource(this.stream)
      const an = this.ac.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let max = 0
        for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i] - 128) / 128)
        this.peaks.push(Math.min(1, max * 1.6))
        this.onPeak?.(this.peaks)
        this.raf = requestAnimationFrame(tick)
      }
      tick()
    } catch { /* 波形失败不阻塞录音 */ }
  }

  elapsed(): number { return (Date.now() - this.t0) / 1000 }

  async stop(): Promise<Recording> {
    const mr = this.mr
    if (!mr) throw new Error('未在录音')
    cancelAnimationFrame(this.raf)
    const blob = await new Promise<Blob>(res => {
      mr.onstop = () => res(new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' }))
      mr.stop()
    })
    this.stream?.getTracks().forEach(t => t.stop())
    this.ac?.close().catch(() => {})
    const duration = this.elapsed()
    return { blob, mime: blob.type, duration, peaks: downsample(this.peaks, 200) }
  }
}

/** 峰值降采样到 n 点（详情页渲染零解码） */
export function downsample(peaks: number[], n: number): number[] {
  if (peaks.length <= n) return peaks.slice()
  const out: number[] = []
  const step = peaks.length / n
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j++) m = Math.max(m, peaks[j])
    out.push(m)
  }
  return out
}

/** 播放辅助：从 Blob 创建 Audio，返回进度订阅 */
export function createPlayer(url: string) {
  const el = new Audio(url)
  el.preload = 'auto'
  return el
}
