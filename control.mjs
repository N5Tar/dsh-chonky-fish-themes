/** Local DSH selection and deployed-pack reader. The manager only calls state/select. */
import { createServer } from 'node:http'
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

const PACK_ID = /^[a-z0-9-]{1,64}$/
const MAX_BODY = 4096
export const CONTROL_DIR = join(homedir(), '.dafeiyu-theme-manager')
export const ENDPOINT_FILE = join(CONTROL_DIR, 'plugin-endpoint.json')
export const DEPLOYED_PACKS_DIR = join(CONTROL_DIR, 'dsh-themes')

function missingOnly(path) {
  try { return lstatSync(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

/** Resolve each request from disk. A present deployed entry always shadows its builtin. */
export class SkinPacks {
  constructor({ builtinDir, deployedDir = DEPLOYED_PACKS_DIR }) {
    this.builtinDir = resolve(builtinDir)
    this.deployedDir = resolve(deployedDir)
  }
  directory(id) {
    if (!PACK_ID.test(id) || id === 'default') throw new Error('invalid-pack')
    const deployed = join(this.deployedDir, id)
    const info = missingOnly(deployed)
    const directory = info ? deployed : join(this.builtinDir, id)
    const selected = info || lstatSync(directory)
    if (!selected.isDirectory() || selected.isSymbolicLink()) throw new Error('invalid-pack-directory')
    return directory
  }
  file(id, relative) {
    if (typeof relative !== 'string' || !relative || relative.startsWith('/') || relative.includes('\\') || relative.split('/').includes('..')) throw new Error('invalid-asset')
    const directory = this.directory(id)
    const root = realpathSync(directory)
    const path = realpathSync(resolve(directory, relative))
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw new Error('invalid-asset')
    return path
  }
  manifest(id) {
    const value = JSON.parse(readFileSync(this.file(id, 'theme.json'), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== id) throw new Error('invalid-theme-manifest')
    const has = relative => { try { this.file(id, relative); return true } catch { return false } }
    const assets = Object.fromEntries(Object.entries(value.assets || {}).map(([slot, relative]) => [slot, has(relative)]))
    const fonts = Object.fromEntries((Array.isArray(value.fonts) ? value.fonts : []).filter(font => font && typeof font.src === 'string').map(font => [font.src, has(font.src)]))
    return { ...value, _available: { assets, fonts, customCss: typeof value.customCss === 'string' ? has(value.customCss) : null } }
  }
  catalog() {
    const ids = new Set()
    for (const root of [this.builtinDir, this.deployedDir]) {
      let entries
      try { entries = readdirSync(root, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
      for (const entry of entries) if (PACK_ID.test(entry.name) && entry.name !== 'default') ids.add(entry.name)
    }
    return [...ids].sort().flatMap(id => {
      try {
        const value = this.manifest(id)
        return [{ id, name: value.meta?.name ?? null, description: value.meta?.description ?? null,
          version: value.meta?.version ?? value.packVersion ?? null, colorScheme: value.meta?.colorScheme ?? null }]
      } catch { return [] } // An invalid deployment hides the builtin with the same id, never replaces it.
    })
  }
}

const json = (res, status, value) => {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)), 'cache-control': 'no-store' })
  res.end(body)
}
async function readJson(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) throw new Error('too-large'); chunks.push(chunk) }
  return bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

/** Selection is owned and persisted by DSH, not replayed by the manager or a browser. */
export class SkinControl {
  constructor(options) {
    if (!options?.repository && (!Array.isArray(options?.packs) || options.packs.some(id => typeof id !== 'string' || !PACK_ID.test(id)))) throw new TypeError('SkinControl requires validated pack ids or a repository')
    this.repository = options.repository
    this.packs = new Set(options.packs || [])
    this.version = options.version
    this.packageName = options.packageName
    this.endpointFile = options.endpointFile ?? ENDPOINT_FILE
    this.selectionFile = options.selectionFile ?? join(dirname(this.endpointFile), 'plugin-selection.json')
    this.pack = null
    try {
      const state = JSON.parse(readFileSync(this.selectionFile, 'utf8'))
      if (typeof state.pack !== 'string' || !PACK_ID.test(state.pack)) throw new Error('invalid saved theme selection')
      this.pack = state.pack
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    this.listeners = new Set()
    this.streams = new Set()
    this.server = null
    this.port = null
  }
  /** Every explicit accepted selection refreshes, even when the id is unchanged. */
  select(value, { onlyIfUnset = false } = {}) {
    if (onlyIfUnset && this.pack !== null) return true
    if (typeof value !== 'string' || !PACK_ID.test(value)) return false
    if (value !== 'default') {
      if (this.repository) { try { this.repository.manifest(value) } catch { return false } }
      else if (!this.packs.has(value)) return false
    }
    mkdirSync(dirname(this.selectionFile), { recursive: true, mode: 0o700 })
    const staging = this.selectionFile + '.' + randomUUID() + '.tmp'
    writeFileSync(staging, JSON.stringify({ pack: value }) + '\n', { mode: 0o600 })
    renameSync(staging, this.selectionFile)
    this.pack = value
    for (const listener of [...this.listeners]) { try { listener(value) } catch { /* isolate listeners */ } }
    return true
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot() {
    return { ok: true, pack: this.pack, version: this.version, packageName: this.packageName,
      packs: this.repository ? this.repository.catalog().map(pack => pack.id) : [...this.packs] }
  }
  /** Notification only: no theme versions or manager commands are replayed on reconnect. */
  events(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'connection': 'keep-alive', 'x-accel-buffering': 'no' })
    let closed = false
    const close = () => { if (closed) return; closed = true; clearInterval(timer); unsubscribe(); this.streams.delete(close); res.end() }
    const refresh = pack => { if (!closed && !res.write('event: refresh\ndata: ' + JSON.stringify({ pack }) + '\n\n')) close() }
    const unsubscribe = this.subscribe(refresh)
    const timer = setInterval(() => { if (!res.write(': keepalive\n\n')) close() }, 15000)
    timer.unref?.()
    this.streams.add(close)
    res.once('close', close)
    refresh(this.pack)
  }
  async handle(req, res) {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && pathname === '/state') { json(res, 200, this.snapshot()); return }
      if (req.method === 'POST' && pathname === '/select') {
        const body = await readJson(req)
        if (!this.select(body?.pack)) { json(res, 400, { ok: false, error: 'invalid-pack' }); return }
        json(res, 200, this.snapshot()); return
      }
      json(res, 404, { ok: false, error: 'not-found' })
    } catch { json(res, 400, { ok: false, error: 'invalid-request' }) }
  }
  async listen() {
    if (this.server) return this.port
    const server = createServer((req, res) => { void this.handle(req, res) })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    this.server = server
    this.port = server.address().port
    const endpoint = { schemaVersion: 1, port: this.port, pid: process.pid, packageName: this.packageName, version: this.version, packs: this.snapshot().packs }
    await mkdir(dirname(this.endpointFile), { recursive: true, mode: 0o700 })
    const staging = `${this.endpointFile}.${process.pid}.tmp`
    await writeFile(staging, JSON.stringify(endpoint, null, 2) + '\n', { mode: 0o600 })
    await rename(staging, this.endpointFile)
    return this.port
  }
  async close() {
    const server = this.server
    const port = this.port
    this.server = null
    this.port = null
    for (const close of [...this.streams]) close()
    try {
      const publication = JSON.parse(await readFile(this.endpointFile, 'utf8'))
      if (publication.pid === process.pid && publication.port === port) await rm(this.endpointFile, { force: true })
    } catch { /* The endpoint may already have been replaced or removed. */ }
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.() })
  }
}
