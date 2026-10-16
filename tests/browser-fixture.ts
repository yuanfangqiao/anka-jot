/** Browser-only fixture with isolated IndexedDB and synthetic media. */
import { createApp, defineComponent, h, ref } from 'vue'
import { setUi, type JotAtt, type JotNote } from '../web/host'
import * as db from '../web/lib/db'
import { processImage } from '../web/lib/image'
import { processVideo } from '../web/lib/video'
import { refreshMedia } from '../web/lib/useMedia'
import { pushOutbox } from '../web/lib/sync'
import { injectUiCss } from '../web/lib/ui.css'
import NoteCard from '../web/components/NoteCard.vue'
import '../../../web/src/styles/tokens.css'
import '../../../web/src/styles/base.css'

const Icon = defineComponent({ setup: () => () => h('span', '◉') })
setUi({ icons: new Proxy({}, { get: () => Icon }),
  api: { async callApp(_id, method, args = {}) {
    const response = await fetch('/__thumbnail_api', { method: 'POST', body: JSON.stringify({ method, args }) })
    if (!response.ok) throw new Error('thumbnail unavailable')
    return response.json()
  } },
  navigation: { register: () => () => {}, setHash: async () => {} },
  toast: { ok() {} }, layout: { isMobile: { value: true }, isWide: { value: false } },
  registerApp() {}, unregisterApp() {}, vue: {}, components: {},
})
injectUiCss()
const notes = ref<JotNote[]>([])
function attachment(id: string, kind: 'image' | 'video', remote = true, thumb = true): JotAtt {
  return { id, noteId: id, kind, sha256: id, createdAt: Date.now(),
    serverPath: remote ? `data/media/original-${kind === 'image' ? 'image.jpg' : 'video.webm'}` : null,
    thumbPath: remote && thumb ? 'data/media/cover.jpg' : null }
}
async function add(att: JotAtt) {
  const note: JotNote = { id: att.id, title: att.id, text: '', tags: [], source: 'camera',
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false, color: null, location: null,
    deleted: false, rev: 1, syncState: 'synced', atts: [att] }
  await db.putAtt(att)
  await db.saveNote(note, false)
  notes.value.push(note)
}
async function seed() {
  const photo = await processImage(await (await fetch('/__samples/full.jpg')).blob())
  const video = await processVideo(await (await fetch('/__samples/clip.webm')).blob())
  if (!photo.thumb || !video.poster) throw new Error('frontend thumbnail generation failed')
  for (const att of [attachment('remote-image', 'image'), attachment('remote-video', 'video'),
    attachment('legacy-image', 'image', true, false), attachment('legacy-video', 'video', true, false)]) await add(att)
  const broken = attachment('broken-image', 'image')
  broken.thumbPath = 'data/media/broken.jpg'
  await add(broken)
  for (const id of ['local-image', 'local-legacy']) {
    const att = attachment(id, 'image', false)
    await db.putBlob(att.id, photo.full)
    if (id !== 'local-legacy') await db.putBlob(att.id + ':thumb', photo.thumb)
    await add(att)
  }
  const localVideo = attachment('local-video', 'video', false)
  await db.putBlob(localVideo.id, await (await fetch('/__samples/clip.webm')).blob())
  await db.putBlob(localVideo.id + ':thumb', video.poster)
  await add(localVideo)
  await add(attachment('unavailable-video', 'video', true, false))
  return { photoBytes: photo.full.size, thumbnailBytes: photo.thumb.size, videoPosterBytes: video.poster.size }
}
createApp({ setup: () => () => h('main', { style: 'padding:20px;max-width:1100px;margin:auto;height:100dvh;overflow:auto' }, [
  h('h1', { style: 'font-size:24px;margin-bottom:16px' }, 'Jot · 缩略图回归'),
  h('div', { class: 'check-grid', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px' },
    notes.value.map(note => h('div', { 'data-note': note.id }, [h(NoteCard, { note })]))),
]) }).mount('#app')
;(window as any).__thumbnailFixture = { seed, refreshMedia,
  async syncDeduplicatedImage() {
    const note = await db.getNote('local-image')
    await db.saveNote({ ...note!, syncState: 'local' }, true)
    await pushOutbox()
    return db.attsOf('local-image')
  },
  async thumbnailDimensions(id: string) {
    const blob = await db.getBlob(id + ':thumb')
    if (!blob) return null
    const image = await createImageBitmap(blob)
    const dimensions = [image.width, image.height]
    image.close()
    return dimensions
  },
}
