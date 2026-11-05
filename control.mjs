/**
 * Minimal local control interface for the theme manager.
 *
 * The plugin listens on a loopback port and publishes the port in a small JSON file.
 * No pairing, no discovery protocol, no credentials: the manager reads that file and
 * calls `GET /state` / `POST /select` on 127.0.0.1.
 */
import { createServer } from 'node:http'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PACK_ID = /^[a-z0-9-]{1,64}$/
const MAX_BODY = 4096

export const CONTROL_DIR = join(homedir(), '.dafeiyu-theme-manager')
export const ENDPOINT_FILE = join(CONTROL_DIR, 'plugin-endpoint.json')

const json = (res, status, value) => {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)), 'cache-control': 'no-store' })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > MAX_BODY) throw new Error('too-large')
    chunks.push(chunk)
  }
  if (bytes === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Shared selection: any window or the manager can change it, every window follows. */
export class SkinControl {
  constructor(options) {
    if (!Array.isArray(options?.packs) || options.packs.some(id => typeof id !== 'string' || !PACK_ID.test(id))) {
      throw new TypeError('SkinControl requires validated pack ids')
    }
    this.packs = new Set(options.packs)
    this.version = options.version
    this.packageName = options.packageName
    this.endpointFile = options.endpointFile ?? ENDPOINT_FILE
    this.pack = null
    this.listeners = new Set()
    this.server = null
    this.port = null
  }

  /** Accept the native default or one of the installed packs; nothing else. */
  select(value) {
    if (value !== 'default' && !(typeof value === 'string' && this.packs.has(value))) return false
    if (this.pack === value) return true
    this.pack = value
    for (const listener of [...this.listeners]) { try { listener(value) } catch { /* isolate listeners */ } }
    return true
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  snapshot() {
    return { ok: true, pack: this.pack, version: this.version, packageName: this.packageName, packs: [...this.packs] }
  }

  async handle(req, res) {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && pathname === '/state') { json(res, 200, this.snapshot()); return }
      if (req.method === 'POST' && pathname === '/select') {
        const body = await readJson(req)
        const pack = body?.pack
        if (!this.select(pack)) { json(res, 400, { ok: false, error: 'invalid-pack' }); return }
        json(res, 200, this.snapshot()); return
      }
      json(res, 404, { ok: false, error: 'not-found' })
    } catch { json(res, 400, { ok: false, error: 'invalid-request' }) }
  }

  /** Bind an OS-assigned loopback port and publish it for the manager. */
  async listen() {
    if (this.server) return this.port
    const server = createServer((req, res) => { void this.handle(req, res) })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { resolve() })
    })
    this.server = server
    this.port = server.address().port
    const endpoint = { schemaVersion: 1, port: this.port, pid: process.pid,
      packageName: this.packageName, version: this.version, packs: [...this.packs] }
    await mkdir(join(this.endpointFile, '..'), { recursive: true, mode: 0o700 })
    const staging = `${this.endpointFile}.${process.pid}.tmp`
    await writeFile(staging, JSON.stringify(endpoint, null, 2) + '\n', { mode: 0o600 })
    await rename(staging, this.endpointFile)
    return this.port
  }

  async close() {
    const server = this.server
    this.server = null
    this.port = null
    // Remove only our own publication, never another instance's.
    try { await rm(this.endpointFile, { force: true }) } catch { /* ignore */ }
    if (server) await new Promise(resolve => { server.close(() => { resolve() }); server.closeAllConnections?.() })
  }
}
