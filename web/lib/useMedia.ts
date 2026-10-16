/** 展示组件拥有自己的 object URL；替换/卸载才释放，LRU 不影响正在显示的媒体。 */
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { mediaUrl, type JotAtt } from '../host'
import * as db from './db'
import { backfillAtt } from './media'
import { ensureLocalThumbnail, publishThumbnail, repairThumbnail } from './thumbnails'

export const mediaRevision = ref(0)
export function refreshMedia() { mediaRevision.value++ }
type Source = { url: string; video: boolean; kind: 'full' | 'thumb' }

export function useMedia(att: () => JotAtt | null | undefined, full = false) {
  const src = ref<string | null>(null)
  const video = ref(false)
  const loading = ref(false)
  let generation = 0
  let owned: string[] = []
  let choices: (() => Promise<Source | null>)[] = []
  let cursor = 0
  let selectedKind: 'full' | 'thumb' = 'thumb'
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
      selectedKind = candidate.kind
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
    function local(key: string, isVideo = false, kind: 'full' | 'thumb' = full ? 'full' : 'thumb') {
      choices.push(async () => {
        const blob = await db.getBlob(key)
        return blob ? { url: URL.createObjectURL(blob), video: isVideo, kind } : null
      })
    }
    function remote(path: string | null | undefined, isVideo = false, kind: 'full' | 'thumb' = full ? 'full' : 'thumb') {
      const url = mediaUrl(path)
      if (url) choices.push(async () => ({
        url: mediaRevision.value ? `${url}?jotRetry=${mediaRevision.value}` : url, video: isVideo, kind,
      }))
    }
    if (!full) {
      local(a.id + ':thumb')
      remote(a.thumbPath)
      const attachment = a
      choices.push(async () => {
        const repaired = await repairThumbnail(attachment, true)
        if (repaired.blob) return { url: URL.createObjectURL(repaired.blob), video: false, kind: 'thumb' }
        const url = mediaUrl(repaired.path)
        return url ? { url, video: false, kind: 'thumb' } : null
      })
    } else {
      local(a.id, a.kind === 'video')
      if (navigator.onLine) remote(a.serverPath, a.kind === 'video')
      if (a.kind === 'image') { local(a.id + ':thumb', false, 'thumb'); remote(a.thumbPath, false, 'thumb') }
      if (!navigator.onLine) remote(a.serverPath, a.kind === 'video')
    }
    await select(token)
  }, { immediate: true, deep: true })
  onUnmounted(() => { generation++; release(owned) })
  function loaded() {
    const a = att()
    if (!a || !src.value) return
    if (!src.value.startsWith('blob:')) {
      void db.attsOf(a.noteId).then(atts => backfillAtt(
        atts.find(item => item.id === a.id) ?? a, selectedKind)).catch(() => {})
    } else if (!full && a.serverPath && !a.thumbPath) {
      void db.attsOf(a.noteId).then(async atts => {
        const latest = atts.find(item => item.id === a.id) ?? a
        if (latest.thumbPath) return
        const blob = await ensureLocalThumbnail(latest)
        if (blob) await publishThumbnail(latest, blob)
      }).catch(() => {})
    }
  }
  return { src, video, loading, failed, loaded }
}
