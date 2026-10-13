/** speech.ts — SpeechRecognition 封装。iOS Safari 不支持 → supported()=false，
 *  UI 降级为「仅录音」。interim 灰字、final 落段。 */
import type { Seg } from '../host'

type SR = any

export function speechSupported(): boolean {
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
}

export class JotSpeech {
  private rec: SR = null
  private base: Seg[] = []
  private running = false
  onSegment: ((segs: Seg[], interim: string) => void) | null = null

  constructor(private lang = 'zh-CN') {}

  start(offsetSec = 0) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor || this.running) return
    this.rec = new Ctor()
    this.rec.lang = this.lang
    this.rec.continuous = true
    this.rec.interimResults = true
    const t0 = Date.now() - offsetSec * 1000
    this.rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const txt = r[0]?.transcript?.trim() ?? ''
        if (!txt) continue
        if (r.isFinal) {
          const t = (Date.now() - t0) / 1000
          this.base.push({ t0: Math.max(0, t - 3), t1: t, text: txt })
        } else interim += txt
      }
      this.onSegment?.(this.base.slice(), interim)
    }
    this.rec.onerror = () => { /* 权限/网络错误静默，录音本体不受影响 */ }
    this.rec.onend = () => {
      // continuous 在部分浏览器会自动断，录音中则续上
      if (this.running) { try { this.rec.start() } catch { /* 忽略 */ } }
    }
    try { this.rec.start(); this.running = true } catch { /* 忽略 */ }
  }

  stop(): Seg[] {
    this.running = false
    try { this.rec?.stop() } catch { /* 忽略 */ }
    this.rec = null
    return this.base.slice()
  }
}
