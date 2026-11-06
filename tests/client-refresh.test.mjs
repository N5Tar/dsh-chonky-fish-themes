import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate) }
const manifest = id => ({ id, tokens: {}, geometry: {}, assets: { 'bg.main': 'bg.png', 'composer.frame': 'frame.png' }, fonts: [{ family: 'TestFont', src: 'font.woff2' }], customCss: 'custom.css', _available: { assets: { 'bg.main': true, 'composer.frame': true }, fonts: { 'font.woff2': true }, customCss: true } })
async function fixture({ selected = 'one', legacy = 'other', fetchManifest } = {}) {
  const state = { pack: selected, packs: ['one', 'other'] }
  let catalog = [{ id: 'one' }, { id: 'other' }], plugin
  const calls = [], styles = [], cleanups = [], intervals = [], images = [], sources = [], slots = []
  const properties = new Map()
  let overrides = 0
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useLayoutEffect() {}, useRef: value => ({ current: value }) }
  const context = {
    console: { warn() {}, error() {} }, AbortController, setTimeout, clearTimeout,
    setInterval: fn => { intervals.push(fn); return fn }, clearInterval: fn => { const i = intervals.indexOf(fn); if (i >= 0) intervals.splice(i, 1) },
    localStorage: { getItem: key => key === 'cf-theme-pack' ? legacy : null, setItem() {}, removeItem() {} },
    document: { documentElement: { style: { getPropertyValue: key => properties.get(key) || '', getPropertyPriority: () => '', setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) } }, querySelector: () => null,
      head: { appendChild: node => styles.push(node) }, createElement: () => ({ textContent: '', setAttribute() {}, remove() { const i = styles.indexOf(this); if (i >= 0) styles.splice(i, 1) } }) },
    Image: class { constructor() { images.push(this) } set src(url) { this.url = url; if (url) queueMicrotask(() => this.onload?.()) } },
    EventSource: class { constructor(url) { assert.equal(url, '/skin/__events'); this.listeners = new Map(); this.closed = false; sources.push(this) } addEventListener(name, fn) { this.listeners.set(name, fn) } removeEventListener(name) { this.listeners.delete(name) } close() { this.closed = true } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options })
      if (url === '/skin/__state') return { ok: true, json: async () => ({ ...state }) }
      if (url === '/skin/index.json') return { ok: true, json: async () => ({ packs: catalog }) }
      if (url === '/skin/__select') { const body = JSON.parse(options.body); if (!body.onlyIfUnset || state.pack === null) state.pack = body.pack; return { ok: true, json: async () => ({ ...state }) } }
      if (url.includes('theme.json')) return fetchManifest ? fetchManifest(url, options) : { ok: true, json: async () => manifest(url.split('/')[2]) }
      if (url.includes('custom.css')) return { ok: true, text: async () => 'body{color:red}' }
      return { ok: true }
    },
    window: { addEventListener() {}, __ModuleLoader__: { load: definition => { plugin = definition.factory(name => { assert.equal(name, 'react'); return React }) } } },
  }
  vm.runInNewContext(source, context, { filename: 'client.js' })
  plugin.apply({
    effect(fn) { cleanups.push(fn()) },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { slots.push({ options, component }); return () => {} } },
    locale: { getLocale: () => ({ active: 'en', locales: [{ id: 'en' }] }), register: () => () => {}, bind: () => key => key, subscribe: () => () => {} },
    theme: { overrideTokens() { overrides++; return () => overrides-- } },
  })
  return { calls, styles, sources, intervals, images, slots, state, overrides: () => overrides,
    catalog(value) { catalog = value },
    async event() { sources[0].listeners.get('refresh')?.({ data: JSON.stringify({ pack: state.pack }) }); await flush() },
    async poll() { for (const tick of [...intervals]) tick(); await flush() },
    async close() { for (const cleanup of cleanups.reverse()) await cleanup?.(); await flush() },
  }
}

test('Host persisted selection wins over old localStorage and SSE opening is a read, not a select replay', async () => {
  const app = await fixture()
  try {
    await app.event()
    assert.equal(app.calls.filter(call => call.url === '/skin/__select').length, 0)
    assert.ok(app.calls.some(call => call.url.startsWith('/skin/one/theme.json?cf=')))
    assert.equal(app.calls.some(call => call.url.startsWith('/skin/other/theme.json')), false)
    assert.equal(app.overrides(), 1)
  } finally { await app.close() }
})

test('ordinary polling discovers new packs without redrawing; explicit same-id refresh changes every asset URL', async () => {
  const app = await fixture()
  try {
    await app.event()
    const first = app.styles[0]
    const firstCss = first.textContent
    const firstManifest = app.calls.find(call => call.url.includes('theme.json')).url
    app.catalog([{ id: 'one' }, { id: 'other' }, { id: 'new-deployment' }])
    await app.poll()
    await app.poll()
    assert.equal(app.styles[0], first)
    assert.equal(app.calls.filter(call => call.url.includes('theme.json')).length, 1)
    const row = app.slots.find(slot => slot.options.name === 'settings.general.item').component()
    assert.ok(JSON.stringify(row).includes('new-deployment'))
    await app.event()
    assert.notEqual(app.styles[0], first)
    assert.notEqual(app.styles[0].textContent, firstCss)
    assert.notEqual(app.calls.filter(call => call.url.includes('theme.json')).at(-1).url, firstManifest)
    assert.equal(app.calls.filter(call => call.url.includes('custom.css?cf=')).length, 2)
    assert.ok(app.styles[0].textContent.includes('font.woff2?cf='))
    assert.notEqual(app.images[0].url, app.images[1].url)
    assert.equal(app.overrides(), 1)
  } finally { await app.close() }
  assert.equal(app.sources[0].closed, true)
  assert.equal(app.sources[0].listeners.size, 0)
  assert.equal(app.intervals.length, 0)
  assert.equal(app.styles.length, 0)
  assert.equal(app.overrides(), 0)
})

test('only an unset Host accepts a guarded legacy proposal', async () => {
  const app = await fixture({ selected: null, legacy: 'other' })
  try {
    await app.event()
    const proposal = app.calls.find(call => call.url === '/skin/__select')
    assert.deepEqual(JSON.parse(proposal.options.body), { pack: 'other', onlyIfUnset: true })
    assert.ok(app.calls.some(call => call.url.startsWith('/skin/other/theme.json')))
    await app.event()
    assert.equal(app.calls.filter(call => call.url === '/skin/__select').length, 1)
  } finally { await app.close() }
})

test('broken selected deployment fails visibly without fetching a builtin or a different theme', async () => {
  const app = await fixture({ selected: 'unreadable', fetchManifest: async () => ({ ok: false, status: 404 }) })
  try {
    await app.event()
    assert.equal(app.styles.length, 0)
    assert.deepEqual(app.calls.filter(call => call.url.includes('theme.json')).map(call => call.url.split('/')[2]), ['unreadable'])
    const row = app.slots.find(slot => slot.options.name === 'settings.general.item').component()
    assert.ok(JSON.stringify(row).includes('theme.json HTTP 404'))
    await app.poll()
    assert.equal(app.calls.filter(call => call.url.includes('theme.json')).length, 1)
  } finally { await app.close() }
})

test('a late same-id manifest response cannot replace the explicit newer load, and native clears rendering', async () => {
  const deferred = []
  const app = await fixture({ fetchManifest: async (_url, options) => new Promise(resolve => deferred.push({ resolve, signal: options.signal })) })
  await app.event()
  await app.event()
  assert.equal(deferred.length, 2)
  assert.equal(deferred[0].signal.aborted, true)
  deferred[1].resolve({ ok: true, json: async () => manifest('one') })
  await flush()
  const current = app.styles[0]
  deferred[0].resolve({ ok: true, json: async () => manifest('one') })
  await flush()
  assert.equal(app.styles[0], current)
  app.state.pack = 'default'
  await app.event()
  assert.equal(app.styles.length, 0)
  await app.close()
})
