/**
 * Host half of the Chonky Fish theme bundle.
 *
 * Responsibilities (M1):
 * - Serve theme pack files from `<pkg>/packs/` over the browser HTTP carrier at `/skin/...`.
 * - Serve `theme.json` annotated with `_available` (which asset/font/customCss files exist on disk),
 *   so the Client half never has to guess and never emits URLs for missing files.
 *
 * Not in scope here: image processing, pack installation, config UI.
 */
import { appendFileSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SkinControl } from './control.mjs'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(PKG_DIR, 'packs')
const DIAG_LOG = join(tmpdir(), 'dsh-skin-diag.log')
/** 诊断默认关闭：仅在 DSH_SKIN_DIAG=1 时写临时日志，避免生产环境无界增长。 */
const DIAG_ENABLED = process.env.DSH_SKIN_DIAG === '1'
const ROUTE = '/skin'

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
}

export const inject = ['webServer']

export function apply(ctx) {
  const version = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')).version
  const control = new SkinControl({ packs: packIds(), version, packageName: '@local/dsh-chonky-fish-themes' })
  // A plain loopback interface is enough for the local manager; windows reach it through this route.
  ctx.effect(() => () => { void control.close() }, 'chonky-fish-themes: control cleanup')
  void control.listen().catch(error => { ctx.logger?.warn?.('chonky-fish-themes: control listener failed: %s', error?.message ?? error) })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: (req, res) => handle(req, res, control) }),
    'chonky-fish-themes: skin asset route',
  )
}

/** Installed pack ids, read from the shipped index. */
function packIds() {
  try {
    const index = JSON.parse(readFileSync(join(PACKS_DIR, 'index.json'), 'utf8'))
    return (Array.isArray(index.packs) ? index.packs : []).map(pack => pack.id).filter(id => typeof id === 'string')
  } catch { return [] }
}

/** Resolve `rel` inside `root`; null on traversal or absolute input. */
function safeResolve(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null
  if (rel.startsWith('/') || rel.split(/[\\/]/).includes('..')) return null
  const abs = resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + sep)) return null
  return abs
}

function isFile(abs) {
  try {
    return existsSync(abs) && statSync(abs).isFile()
  } catch {
    return false
  }
}

/** 临时诊断：把 Client 上报与素材请求写入临时日志，便于无浏览器控制时定位问题。 */
function logDiag(entry) {
  if (!DIAG_ENABLED) return
  try {
    appendFileSync(DIAG_LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n')
  } catch {
    /* diagnostics must never break serving */
  }
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= limit) chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
  })
  res.end(text)
}

/** Which declared files actually exist on disk. */
function availability(packDir, manifest) {
  const has = (rel) => {
    const abs = safeResolve(packDir, rel)
    return Boolean(abs) && isFile(abs)
  }
  const assets = {}
  for (const [slot, rel] of Object.entries(manifest.assets ?? {})) assets[slot] = has(rel)
  const fonts = {}
  for (const entry of Array.isArray(manifest.fonts) ? manifest.fonts : []) {
    if (entry && typeof entry.src === 'string') fonts[entry.src] = has(entry.src)
  }
  const customCss = typeof manifest.customCss === 'string' ? has(manifest.customCss) : null
  return { assets, fonts, customCss }
}

function handleManifest(res, packId) {
  const packDir = safeResolve(PACKS_DIR, packId)
  const manifestPath = packDir ? join(packDir, 'theme.json') : null
  if (!manifestPath || !isFile(manifestPath)) {
    sendText(res, 404, `theme pack not found: ${packId}`)
    return
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    sendText(res, 500, `invalid theme.json: ${err.message}`)
    return
  }
  sendJson(res, 200, { ...manifest, _available: availability(packDir, manifest) })
}

async function handle(req, res, control) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      sendText(res, 400, 'bad path')
      return
    }

    // Same-origin state for every DSH window; the manager uses the loopback port instead.
    if (pathname === ROUTE + '/__state') {
      sendJson(res, 200, control.snapshot())
      return
    }

    if (pathname === ROUTE + '/__select') {
      if (req.method !== 'POST') { sendText(res, 405, 'method not allowed'); return }
      let body
      try { body = JSON.parse(await readBody(req)) } catch { sendText(res, 400, 'bad body'); return }
      if (!control.select(body?.pack)) { sendText(res, 400, 'invalid pack'); return }
      sendJson(res, 200, control.snapshot())
      return
    }

    if (pathname === ROUTE + '/__diag') {
      const body = req.method === 'POST' ? await readBody(req) : ''
      logDiag({ kind: 'client', body })
      res.writeHead(204, { 'cache-control': 'no-store' })
      res.end()
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'method not allowed')
      return
    }

    if (pathname !== ROUTE && !pathname.startsWith(ROUTE + '/')) {
      sendText(res, 404, 'not found')
      return
    }
    const rel = pathname.slice(ROUTE.length).replace(/^\/+/, '')
    if (!rel) {
      sendText(res, 404, 'not found')
      return
    }

    const manifestMatch = /^([a-z0-9-]+)\/theme\.json$/.exec(rel)
    if (manifestMatch) {
      handleManifest(res, manifestMatch[1])
      return
    }

    const abs = safeResolve(PACKS_DIR, rel)
    if (!abs || !isFile(abs)) {
      sendText(res, 404, 'not found')
      return
    }
    const size = statSync(abs).size
    res.writeHead(200, {
      'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'no-cache',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(abs).pipe(res)
  } catch {
    try {
      sendText(res, 500, 'internal error')
    } catch {
      /* response already gone */
    }
  }
}
