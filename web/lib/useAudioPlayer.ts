/** useAudioPlayer — 单音频播放 composable（与 AudioCard 播放逻辑同源）：
 *  blobUrl → mediaUrl 回退取流，播放/暂停切换，progress 0..1，组件卸载即停播释放。 */
import { onUnmounted, ref } from 'vue'
import { mediaUrl, toast, type JotAtt } from '../host'
import * as db from './db'
import { backfillAtt } from './media'

export function useAudioPlayer(att: () => JotAtt | null) {
  const playing = ref(false)
  const progress = ref(0)
  let el: HTMLAudioElement | null = null

  async function toggle() {
    const a = att()
    if (!a) return
    if (playing.value) { el?.pause(); return }
    if (!el) {
      const url = (await db.blobUrl(a.id)) ?? mediaUrl(a.serverPath)
      if (!url) { toast('音频尚未同步到本机', false); return }
      if (!url.startsWith('blob:')) void backfillAtt(a) // 服务端兜底播放：顺手回填本地
      el = new Audio(url)
      el.ontimeupdate = () => {
        progress.value = a.duration ? el!.currentTime / a.duration : 0
      }
      el.onended = () => { playing.value = false; progress.value = 0 }
      el.onpause = () => { playing.value = false }
      el.onplay = () => { playing.value = true }
      el.onerror = () => { playing.value = false; toast('音频加载失败', false) }
    }
    try {
      await el.play()
    } catch (e) {
      playing.value = false
      console.error('[jot] 语音播放失败', e)
      toast('音频播放失败', false)
    }
  }

  onUnmounted(() => { el?.pause(); el = null })

  return { playing, progress, toggle }
}
