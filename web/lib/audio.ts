/** audio.ts — MediaRecorder 封装：会话级持久麦克风流（iOS 二次录音无声修复）。
 *  iOS WebKit 下，每次录音都 getUserMedia 时：第二次拿到的流 track 虽是 live，
 *  但音频会话未重新激活 → MediaRecorder 录到静音、Analyser 读到全 0（波形平线）。
 *  改为整个 app 会话复用一条流：每次录音仅新建 MediaRecorder，
 *  共享一个 AudioContext（每次 start 时 resume）。流失效（track ended）自动重建。
 *  分片收集（防崩溃丢整段）、Analyser 实时波形采样、峰值降采样。mime 嗅探兼容 Safari。 */

export interface Recording { blob: Blob; mime: string; duration: number; peaks: number[] }

export function pickMime(): string {
  const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg']
  const MR = (window as any).MediaRecorder
  if (!MR) return ''
  return cands.find(c => MR.isTypeSupported?.(c)) ?? ''
}

// ─── MicSession：会话级持久麦克风流 ─────────────────────
let micStream: MediaStream | null = null
let micStreamPromise: Promise<MediaStream> | null = null
let sharedAC: AudioContext | null = null

/** 共享 AudioContext（iOS 对上下文数量有限制；挂起态由调用方 resume） */
export function sharedAudioContext(): AudioContext {
  if (!sharedAC || sharedAC.state === 'closed') {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    sharedAC = new Ctx()
  }
  return sharedAC
}

/** 首次 getUserMedia，之后复用；track ended（后台被杀）或 muted
 *  （iOS PWA 前后台切换后常保持 live 但无声）时自动重建 */
export function acquireMicStream(): Promise<MediaStream> {
  const alive = micStream && micStream.getTracks().some(
    t => t.readyState === 'live' && !t.muted)
  if (alive) return Promise.resolve(micStream!)
  if (!micStreamPromise) {
    micStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { micStream = s; micStreamPromise = null; return s })
      .catch(e => { micStreamPromise = null; throw e })
  }
  return micStreamPromise
}

/** 仅插件 teardown 调用：释放整条流与共享 AudioContext */
export function releaseMic(): void {
  micStream?.getTracks().forEach(t => t.stop())
  micStream = null
  if (sharedAC && sharedAC.state !== 'closed') sharedAC.close().catch(() => {})
  sharedAC = null
}

export class JotRecorder {
  private mr: MediaRecorder | null = null
  private chunks: Blob[] = []
  private t0 = 0
  peaks: number[] = []
  onPeak: ((peaks: number[]) => void) | null = null
  private raf = 0
  private src: MediaStreamAudioSourceNode | null = null

  static supported(): boolean {
    return Boolean((navigator.mediaDevices as any)?.getUserMedia && (window as any).MediaRecorder)
  }

  async start(): Promise<void> {
    const stream = await acquireMicStream()
    const mime = pickMime()
    this.mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.peaks = []
    this.mr.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data) }
    this.mr.start(1000) // 分片：崩溃最多丢 1s
    this.t0 = Date.now()

    // 实时波形采样（共享 AudioContext；挂起态必须 resume 才有数据）
    try {
      const ac = sharedAudioContext()
      await ac.resume().catch(() => {})
      const an = ac.createAnalyser()
      an.fftSize = 512
      this.src = ac.createMediaStreamSource(stream)
      this.src.connect(an)
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
    // 只停 MediaRecorder 与波形源；流与 AudioContext 保持存活，供下次录音复用
    try { this.src?.disconnect() } catch { /* 忽略 */ }
    this.src = null
    const blob = await new Promise<Blob>(res => {
      mr.onstop = () => res(new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' }))
      mr.stop()
    })
    this.mr = null
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
