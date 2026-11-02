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
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(PKG_DIR, 'packs')
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
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: handle }),
    'chonky-fish-themes: skin asset route',
  )
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

function handle(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'method not allowed')
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      sendText(res, 400, 'bad path')
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
