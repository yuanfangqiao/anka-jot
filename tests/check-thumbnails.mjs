/** Real Vue cards + browser thumbnail pipeline. All APIs/media are isolated fixtures. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../../../web/node_modules/vite/dist/node/index.js'

const { chromium } = await import(process.env.ANKA_PLAYWRIGHT_MODULE || 'playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'jot-thumbnails-browser-'))
const output = process.env.ANKA_THUMB_SCREENSHOTS || temporary
await mkdir(output, { recursive: true })
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 10 * 1024 * 1024 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr.toString())
  return result.stdout
}
const full = ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1600x900:rate=1', '-frames:v', '1',
  '-threads', '1', '-q:v', '2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'])
const cover = ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=1', '-frames:v', '1',
  '-threads', '1', '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'])
const clipFile = path.join(temporary, 'clip.webm')
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10', '-t', '0.6', '-threads', '1',
  '-c:v', 'libvpx', '-b:v', '500k', clipFile])
const clip = await readFile(clipFile)
const previousCwd = process.cwd()
process.chdir(path.join(root, 'web'))
const calls = []
const mediaRequests = []
const server = await createServer({
  root: path.join(root, 'web'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  plugins: [{ name: 'isolated-thumbnail-check', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url, 'http://localhost').pathname
      if (pathname === '/__thumbnail_check') {
        response.setHeader('Content-Type', 'text/html')
        response.end(`<div id="app"></div><script type="module" src="/@fs${here}/browser-fixture.ts"></script>`)
        return
      }
      if (pathname === '/__thumbnail_api') {
        let body = ''
        for await (const data of request) body += data
        const call = JSON.parse(body)
        calls.push(call)
        response.setHeader('Content-Type', 'application/json')
        if (call.args.attId === 'unavailable-video') {
          response.statusCode = 400; response.end('{}'); return
        }
        const result = call.method === 'upsert_note' ? { applied: true, serverRev: 2 }
          : { path: `data/media/original-${call.args.attId?.includes('video') ? 'video.webm' : 'image.jpg'}`,
            thumbPath: call.method === 'upload_begin' ? 'data/media/cover.jpg' : 'data/media/repaired.jpg',
            exists: call.method === 'upload_begin' }
        response.end(JSON.stringify({ ok: true, result }))
        return
      }
      const fixtures = {
        '/__samples/full.jpg': [full, 'image/jpeg'], '/__samples/clip.webm': [clip, 'video/webm'],
        '/plugins/anka-jot/data/media/cover.jpg': [cover, 'image/jpeg'],
        '/plugins/anka-jot/data/media/repaired.jpg': [cover, 'image/jpeg'],
        '/plugins/anka-jot/data/media/original-image.jpg': [full, 'image/jpeg'],
        '/plugins/anka-jot/data/media/original-video.webm': [clip, 'video/webm'],
      }
      if (pathname.startsWith('/plugins/anka-jot/data/')) mediaRequests.push(pathname)
      if (pathname === '/plugins/anka-jot/data/media/broken.jpg') {
        response.statusCode = 404; response.end(); return
      }
      const item = fixtures[pathname]
      if (item) { response.setHeader('Content-Type', item[1]); response.end(item[0]); return }
      next()
    })
  } }],
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, channel: process.env.ANKA_BROWSER_CHANNEL || 'chrome' })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__thumbnail_check`)
  await page.waitForFunction(() => window.__thumbnailFixture)
  const sizes = await page.evaluate(() => window.__thumbnailFixture.seed())
  assert.ok(sizes.thumbnailBytes < sizes.photoBytes / 2)
  assert.ok(sizes.videoPosterBytes > 0)
  const imageIds = ['remote-image', 'remote-video', 'legacy-image', 'legacy-video',
    'broken-image', 'local-image', 'local-legacy', 'local-video']
  for (const id of imageIds) {
    const image = page.locator(`[data-note="${id}"] .jot-media-preview img`)
    await page.locator(`[data-note="${id}"]`).scrollIntoViewIfNeeded()
    await image.waitFor({ state: 'visible' })
    await image.evaluate(img => new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth) return resolve()
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', () => reject(new Error('cover did not load')), { once: true })
    }))
    const width = await image.evaluate(img => img.naturalWidth)
    assert.ok(width > 0 && width <= 480, `${id}: ${width}`)
  }
  assert.equal(await page.locator('.jot-media-preview video').count(), 0)
  assert.ok(!mediaRequests.some(url => url.includes('/original-')), mediaRequests.join('\n'))
  for (const id of ['local-image', 'local-legacy', 'local-video']) {
    const dimensions = await page.evaluate(id => window.__thumbnailFixture.thumbnailDimensions(id), id)
    assert.ok(dimensions && Math.max(...dimensions) <= 480)
  }
  assert.ok(calls.some(call => call.method === 'ensure_thumbnail' && call.args.attId === 'broken-image' && call.args.force))
  console.log('PASS frontend image/video thumbnails, legacy repair, covers never request originals')

  await page.locator('[data-note="remote-image"] .jot-imgcard').click()
  await page.waitForFunction(() => document.querySelector('img[alt="图片预览"]')?.naturalWidth === 1600)
  assert.ok(mediaRequests.some(url => url.endsWith('/original-image.jpg')))
  await page.getByRole('button', { name: '关闭预览' }).click()
  console.log('PASS full image requested only after opening viewer')

  const synced = await page.evaluate(() => window.__thumbnailFixture.syncDeduplicatedImage())
  assert.equal(synced[0].thumbPath, 'data/media/cover.jpg')
  assert.ok(calls.some(call => call.method === 'upload_begin' && call.args.thumbB64?.length > 0))
  assert.ok(calls.some(call => call.method === 'upsert_note' && call.args.atts[0].thumbPath === 'data/media/cover.jpg'))
  assert.ok(!calls.some(call => call.method === 'upload_chunk'))
  console.log('PASS deduplicated sync sends a thumbnail and preserves returned cover path')

  await page.evaluate(() => window.__thumbnailFixture.refreshMedia())
  await page.locator('[data-note="local-image"] img').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-note="local-image"] img')
    return image?.complete && image.naturalWidth > 0
  })
  assert.equal(await page.locator('[data-note="unavailable-video"] .jot-media-preview video').count(), 0)
  assert.deepEqual(errors, [])
  await page.locator('main').evaluate(main => { main.scrollTop = 0 })
  await page.screenshot({ path: path.join(output, 'thumbnails-mobile.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(await page.locator('h1').count(), 1)
  await page.screenshot({ path: path.join(output, 'thumbnails-desktop.png'), fullPage: false })
  console.log('PASS media refresh, desktop/mobile screenshots; browser errors: 0')
} finally {
  await browser?.close()
  await server.close()
  await rm(temporary, { recursive: true, force: true })
  process.chdir(previousCwd)
}
