/** 展示组件拥有自己的 object URL；替换/卸载才释放，LRU 不影响正在显示的媒体。 */
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { mediaUrl, type JotAtt } from '../host'
import * as db from './db'
import { backfillAtt } from './media'

export const mediaRevision = ref(0)
export function refreshMedia() { mediaRevision.value++ }
type Source = { url: string; video: boolean }

export function useMedia(att: () => JotAtt | null | undefined, full = false) {
  const src = ref<string | null>(null)
  const video = ref(false)
  const loading = ref(false)
  let generation = 0
  let owned: string[] = []
  let choices: (() => Promise<Source | null>)[] = []
  let cursor = 0
  const release = (urls: string[]) => urls.forEach(url => URL.revokeObjectURL(url))

  async function select(token: number) {
    loading.value = true
    src.value = null
    while (token === generation && cursor < choices.length) {
      const candidate = await choices[cursor++]().catch(() => null)
      if (!candidate) continue
      if (token !== generation) {
        if (candidate.url.startsWith('blob:')) URL.revokeObjectURL(candidate.url)
        return
      }
      if (candidate.url.startsWith('blob:')) owned.push(candidate.url)
      video.value = candidate.video
      src.value = candidate.url + (candidate.video && !full ? '#t=0.001' : '')
      break
    }
    if (token === generation) loading.value = false
  }
  function failed() { if (!loading.value) void select(generation) }

  watch([att, mediaRevision], async () => {
    const token = ++generation
    let a = att()
    const old = owned
    owned = []
    choices = []
    cursor = 0
    src.value = null
    loading.value = Boolean(a)
    // DOM 已不再引用旧 URL 后释放，而不是撤销共享缓存中的 URL。
    void nextTick().then(() => release(old))
    if (!a) return
    a = (await db.attsOf(a.noteId).catch(() => [])).find(item => item.id === a!.id) ?? a
    if (token !== generation) return
    function local(key: string, isVideo = false) {
      choices.push(async () => {
        const blob = await db.getBlob(key)
        return blob ? { url: URL.createObjectURL(blob), video: isVideo } : null
      })
    }
    function remote(path: string | null | undefined, isVideo = false) {
      const url = mediaUrl(path)
      if (url) choices.push(async () => ({
        url: mediaRevision.value ? `${url}?jotRetry=${mediaRevision.value}` : url, video: isVideo,
      }))
    }
    // 按需读取下一来源：有海报时不预先物化整段视频，有原图时不等待缩略图。
    if (a.kind === 'video' && !full) {
      local(a.id + ':thumb')
      remote(a.thumbPath)
      local(a.id, true)
      remote(a.serverPath, true)
    } else {
      local(a.id, a.kind === 'video')
      if (navigator.onLine) remote(a.serverPath, a.kind === 'video')
      if (a.kind === 'image') { local(a.id + ':thumb'); remote(a.thumbPath) }
      if (!navigator.onLine) remote(a.serverPath, a.kind === 'video')
    }
    await select(token)
  }, { immediate: true, deep: true })
  onUnmounted(() => { generation++; release(owned) })
  function loaded() {
    const a = att()
    if (a && src.value && !src.value.startsWith('blob:')) {
      // 显示成功后再回填缓存，不阻塞出图。
      void db.attsOf(a.noteId).then(atts => {
        const latest = atts.find(item => item.id === a.id) ?? a
        return backfillAtt(latest, latest.kind === 'image' ? 'full' : 'thumb')
      }).catch(() => {})
    }
  }
  return { src, video, loading, failed, loaded }
}
