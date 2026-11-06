import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rename, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { SkinControl, SkinPacks, DEPLOYED_PACKS_DIR } from '../control.mjs'
import { createSkinHandler } from '../index.js'

async function put(root, id, text = 'original') {
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'theme.json'), JSON.stringify({ id, meta: { name: text }, assets: { 'bg.main': 'bg.txt' } }))
  await writeFile(join(dir, 'bg.txt'), text)
  return dir
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'skin-deployed-'))
  const builtinDir = join(dir, 'builtin'), deployedDir = join(dir, 'dsh-themes')
  await put(builtinDir, 'one', 'builtin')
  const repository = new SkinPacks({ builtinDir, deployedDir })
  const options = { repository, version: '0.1.1', packageName: '@local/dsh-chonky-fish-themes', endpointFile: join(dir, 'endpoint.json') }
  const control = new SkinControl(options)
  const server = createServer(createSkinHandler(repository, control))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await control.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.() }) })
  return { dir, builtinDir, deployedDir, repository, control, options, base: `http://127.0.0.1:${server.address().port}` }
}

test('deployment root is the agreed standalone directory', () => {
  assert.ok(DEPLOYED_PACKS_DIR.endsWith('/.dafeiyu-theme-manager/dsh-themes'))
})

test('catalog, manifests and assets discover deployments live and consistently prefer them', async t => {
  const f = await fixture(t)
  assert.equal(f.repository.manifest('one').meta.name, 'builtin')
  await put(f.deployedDir, 'one', 'deployed')
  await put(f.deployedDir, 'two', 'new')
  await put(f.deployedDir, '.staging-three', 'hidden')
  const catalog = await (await fetch(f.base + '/skin/index.json')).json()
  assert.deepEqual(catalog.packs.map(pack => pack.id), ['one', 'two'])
  assert.equal(catalog.packs[0].name, 'deployed')
  assert.equal((await (await fetch(f.base + '/skin/one/theme.json')).json()).meta.name, 'deployed')
  const asset = await fetch(f.base + '/skin/one/bg.txt')
  assert.equal(await asset.text(), 'deployed')
  assert.equal(asset.headers.get('cache-control'), 'no-store')
  assert.equal(f.control.select('two'), true)
  assert.deepEqual(f.control.snapshot().packs, ['one', 'two'])
})

test('present broken deployment shadows builtin and errors rather than silently falling back', async t => {
  const f = await fixture(t)
  const deployed = await put(f.deployedDir, 'one', 'deployed')
  assert.equal(f.control.select('one'), true)
  await writeFile(join(deployed, 'theme.json'), 'not-json')
  assert.throws(() => f.repository.manifest('one'))
  assert.deepEqual(f.repository.catalog(), [])
  assert.equal(f.control.select('one'), false)
  assert.equal((await fetch(f.base + '/skin/one/theme.json')).status, 404)
  assert.equal(f.control.snapshot().pack, 'one')
  const restored = new SkinControl(f.options)
  assert.equal(restored.snapshot().pack, 'one', 'saved missing/broken selection is not replaced')
})

test('same-id atomic replacement rereads disk, and DSH restores selection without manager replay', async t => {
  const f = await fixture(t)
  await put(f.deployedDir, 'one', 'first')
  assert.equal(f.control.select('one'), true)
  const stagingRoot = join(f.dir, '.staging')
  await put(stagingRoot, 'one', 'second')
  await rename(join(f.deployedDir, 'one'), join(f.dir, '.old-one'))
  await rename(join(stagingRoot, 'one'), join(f.deployedDir, 'one'))
  const seen = []
  const off = f.control.subscribe(value => seen.push(value))
  assert.equal(f.control.select('one'), true)
  off()
  assert.deepEqual(seen, ['one'])
  assert.equal(await (await fetch(f.base + '/skin/one/bg.txt')).text(), 'second')
  const restored = new SkinControl(f.options)
  assert.equal(restored.snapshot().pack, 'one')
  assert.equal(restored.select('default', { onlyIfUnset: true }), true)
  assert.equal(restored.snapshot().pack, 'one', 'old browser value cannot overwrite Host selection')
  assert.equal(restored.select('default'), true)
  assert.equal(await readFile(join(f.deployedDir, 'one', 'bg.txt'), 'utf8'), 'second')
  assert.equal(new SkinControl(f.options).snapshot().pack, 'default')
})

test('SSE sends an opening snapshot and every explicit same-id selection, not ordinary reads', async t => {
  const f = await fixture(t)
  const abort = new AbortController()
  t.after(() => abort.abort())
  const response = await fetch(f.base + '/skin/__events', { signal: abort.signal })
  assert.equal(response.headers.get('content-type'), 'text/event-stream')
  const reader = response.body.getReader()
  const opening = new TextDecoder().decode((await reader.read()).value)
  assert.match(opening, /event: refresh\ndata: \{"pack":null\}/)
  assert.equal(f.control.listeners.size, 1)
  f.control.snapshot()
  assert.equal(f.control.select('one'), true)
  assert.match(new TextDecoder().decode((await reader.read()).value), /"pack":"one"/)
  assert.equal(f.control.select('one'), true)
  assert.match(new TextDecoder().decode((await reader.read()).value), /"pack":"one"/)
  abort.abort()
  await f.control.close()
  assert.equal(f.control.listeners.size, 0)
  assert.equal(f.control.streams.size, 0)
})

test('routes reject traversal and escaping symlinks; malformed deployment does not expose builtin assets', async t => {
  const f = await fixture(t)
  await mkdir(f.deployedDir, { recursive: true })
  await symlink(join(f.builtinDir, 'one'), join(f.deployedDir, 'one'))
  assert.equal(f.control.select('one'), false)
  assert.equal((await fetch(f.base + '/skin/one/bg.txt')).status, 404)
  await put(f.deployedDir, 'two')
  await writeFile(join(f.dir, 'secret.txt'), 'secret')
  await symlink(join(f.dir, 'secret.txt'), join(f.deployedDir, 'two', 'escape.txt'))
  assert.equal((await fetch(f.base + '/skin/two/escape.txt')).status, 404)
  assert.equal((await fetch(f.base + '/skin/two/%2e%2e%2fsecret.txt')).status, 404)
})
