import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkinControl } from '../control.mjs'

const packs = ['dafeiyu-mecha', 'dafeiyu-armor']

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'skin-control-'))
  const control = new SkinControl({ packs, version: '0.1.1', packageName: '@local/dsh-chonky-fish-themes', endpointFile: join(dir, 'endpoint.json') })
  return { dir, control }
}

test('only installed packs or the native default can be selected', async () => {
  const { control } = await fixture()
  assert.equal(control.snapshot().pack, null)
  assert.equal(control.select('default'), true)
  assert.equal(control.select('dafeiyu-armor'), true)
  for (const value of ['../etc/passwd', 'unknown-pack', '', null, 42, 'dafeiyu-mecha/../x']) assert.equal(control.select(value), false, String(value))
  assert.equal(control.snapshot().pack, 'dafeiyu-armor')
})

test('the loopback interface publishes its port and serves state and selection', async () => {
  const { control, dir } = await fixture()
  const port = await control.listen()
  assert.ok(Number.isInteger(port) && port > 0)
  const endpoint = JSON.parse(await readFile(join(dir, 'endpoint.json'), 'utf8'))
  assert.equal(endpoint.port, port)
  assert.equal(endpoint.pid, process.pid)
  assert.deepEqual(endpoint.packs, packs)
  assert.equal((await stat(join(dir, 'endpoint.json'))).mode & 0o777, 0o600)

  const base = `http://127.0.0.1:${port}`
  assert.equal((await (await fetch(base + '/state')).json()).pack, null)
  const selected = await fetch(base + '/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pack: 'dafeiyu-mecha' }) })
  assert.equal(selected.status, 200)
  assert.equal((await selected.json()).pack, 'dafeiyu-mecha')
  assert.equal((await (await fetch(base + '/state')).json()).pack, 'dafeiyu-mecha')
  const rejected = await fetch(base + '/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pack: '../x' }) })
  assert.equal(rejected.status, 400)
  assert.equal((await fetch(base + '/nope')).status, 404)
  await control.close()
  assert.equal(await readFile(join(dir, 'endpoint.json'), 'utf8').then(() => 'present', () => 'gone'), 'gone')
})

test('subscribers observe accepted changes only', async () => {
  const { control } = await fixture()
  const seen = []
  const off = control.subscribe(value => seen.push(value))
  control.select('dafeiyu-armor')
  control.select('dafeiyu-armor')
  control.select('nope')
  off()
  control.select('default')
  assert.deepEqual(seen, ['dafeiyu-armor'])
})
