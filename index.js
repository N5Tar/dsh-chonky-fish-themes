/** Host theme files are read from the shared deployment directory, then builtin packs. */
import { appendFileSync, createReadStream, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SkinControl, SkinPacks } from './control.mjs'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const DIAG_LOG = join(tmpdir(), 'dsh-skin-diag.log')
const DIAG_ENABLED = process.env.DSH_SKIN_DIAG === '1'
const ROUTE = '/skin'
const MIME = { '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.css': 'text/css; charset=utf-8' }
export const inject = ['webServer']

export async function apply(ctx) {
  const version = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')).version
  const repository = new SkinPacks({ builtinDir: join(PKG_DIR, 'packs') })
  const control = new SkinControl({ repository, version, packageName: '@local/dsh-chonky-fish-themes' })
  ctx.effect(() => () => control.close(), 'chonky-fish-themes: control cleanup')
  await control.listen()
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: createSkinHandler(repository, control) }), 'chonky-fish-themes: skin asset route')
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new Error('body too large'); chunks.push(chunk) }
  return Buffer.concat(chunks).toString('utf8')
}
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)), 'cache-control': 'no-store' })
  res.end(body)
}
function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

/** Same reader owns the catalog, validation, manifests and assets. */
export function createSkinHandler(repository, control) {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      let pathname
      try { pathname = decodeURIComponent(url.pathname) } catch { sendText(res, 400, 'bad path'); return }
      if (pathname === ROUTE + '/__events') {
        if (req.method !== 'GET') { sendText(res, 405, 'method not allowed'); return }
        control.events(req, res)
        return
      }
      if (pathname === ROUTE + '/__state') {
        if (req.method !== 'GET') { sendText(res, 405, 'method not allowed'); return }
        sendJson(res, 200, control.snapshot()); return
      }
      if (pathname === ROUTE + '/__select') {
        if (req.method !== 'POST') { sendText(res, 405, 'method not allowed'); return }
        let body
        try { body = JSON.parse(await readBody(req, 4096)) } catch { sendText(res, 400, 'bad body'); return }
        if (!control.select(body?.pack, { onlyIfUnset: body?.onlyIfUnset === true })) { sendText(res, 400, 'invalid pack'); return }
        sendJson(res, 200, control.snapshot()); return
      }
      if (pathname === ROUTE + '/__diag') {
        if (DIAG_ENABLED) {
          const body = req.method === 'POST' ? await readBody(req) : ''
          try { appendFileSync(DIAG_LOG, JSON.stringify({ t: new Date().toISOString(), body }) + '\n') } catch { /* Optional diagnostics cannot break theme serving. */ }
        }
        res.writeHead(204, { 'cache-control': 'no-store' }); res.end(); return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { sendText(res, 405, 'method not allowed'); return }
      if (pathname === ROUTE + '/index.json') { sendJson(res, 200, { packs: repository.catalog() }); return }
      const match = /^\/skin\/([a-z0-9-]{1,64})\/(.+)$/.exec(pathname)
      if (!match) { sendText(res, 404, 'not found'); return }
      const [, id, relative] = match
      if (relative === 'theme.json') {
        try { sendJson(res, 200, repository.manifest(id)) } catch { sendText(res, 404, 'theme pack unreadable: ' + id) }
        return
      }
      let file
      try { file = repository.file(id, relative) } catch { sendText(res, 404, 'not found'); return }
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': String(statSync(file).size), 'cache-control': 'no-store' })
      if (req.method === 'HEAD') { res.end(); return }
      const stream = createReadStream(file)
      stream.on('error', () => res.destroy())
      res.once('close', () => stream.destroy())
      stream.pipe(res)
    } catch {
      if (res.headersSent) res.destroy()
      else sendText(res, 500, 'theme operation failed')
    }
  }
}
