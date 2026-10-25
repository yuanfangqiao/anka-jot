/** Isolated browser fixture. Run with Node from the repository root. */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../../../web/node_modules/vite/dist/node/index.js'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const python = spawn(path.join(root, '.venv/bin/python'), ['-u', path.join(here, 'interaction-api.py')],
  { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe', 'pipe', 'inherit'] })
const waiting = []
createInterface({ input: python.stdout }).on('line', line => waiting.shift()?.(JSON.parse(line)))
function call(request) {
  return new Promise(resolve => { waiting.push(resolve); python.stdin.write(JSON.stringify(request) + '\n') })
}
const server = await createServer({ configFile: false, root: path.join(root, 'web'),
  plugins: [(await import('../../../web/node_modules/@vitejs/plugin-vue/dist/index.mjs')).default(),
    { name: 'jot-interactions', configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname === '/anka-jot') {
          response.setHeader('Content-Type', 'text/html')
          response.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><html data-theme="dark"><div id="app"></div><script type="module" src="/@fs${here}/interaction-fixture.ts"></script></html>`)
        } else if (url.pathname === '/__fixture_api') {
          let data = ''
          for await (const part of request) data += part
          const result = await call(JSON.parse(data))
          response.setHeader('Content-Type', 'application/json')
          response.statusCode = result.ok ? 200 : 400
          response.end(JSON.stringify(result))
        } else next()
      })
    } }],
  resolve: { alias: { vue: path.join(root, 'web/node_modules/vue') } },
  server: { host: '127.0.0.1', port: 5184, strictPort: true, fs: { allow: [root] } }, logLevel: 'warn',
})
await server.listen()
console.log('Isolated Jot fixture: http://127.0.0.1:5184/anka-jot')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await server.close(); python.kill(); process.exit(0)
})
