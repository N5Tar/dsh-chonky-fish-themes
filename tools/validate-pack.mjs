#!/usr/bin/env node
/**
 * validate-pack — 主题包校验器（契约见 docs/skin/theme-pack-spec.md v0.1.1）
 *
 * 用法：
 *   node tools/validate-pack.mjs [packs/<id>] [--allow-missing-files] [--json]
 *
 * 退出码：0 = 通过（可能有警告）；1 = 有错误；2 = 用法/解析错误。
 *
 * 只做静态校验：JSON 结构、枚举、能力依赖、文件存在性与体积。
 * 图像级检查（尺寸/透明/静区对比度）不在本脚本范围，见 asset-brief 的自检清单。
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const ENGINE_VERSION = '0.1.0' // 当前引擎支持的契约版本（minEngine 上限）

/* ------------------------------- 契约常量 ------------------------------- */

const TOP_KEYS = [
  'packVersion', 'id', 'minEngine', 'meta', 'tokens', 'fonts',
  'assets', 'geometry', 'copy', 'decor', 'chrome', 'capabilities', 'customCss',
]

const META_KEYS = ['name', 'author', 'version', 'colorScheme']

const SLOT_RULES = {
  'bg.main': { required: true, ext: ['.webp', '.png'], maxBytes: 500 * 1024 },
  'bg.wide': { required: false, ext: ['.webp', '.png'], maxBytes: 550 * 1024 },
  portrait: { required: false, ext: ['.webp', '.png'], maxBytes: 200 * 1024 },
  wordmark: { required: false, ext: ['.svg'], maxBytes: 10 * 1024 },
  signature: { required: false, ext: ['.svg'], maxBytes: 8 * 1024 },
  'decor.hud': { required: false, ext: ['.svg'], maxBytes: 40 * 1024 },
  noise: { required: false, ext: ['.png'], maxBytes: 8 * 1024 },
  'composer.frame': { required: false, ext: ['.png'], maxBytes: 300 * 1024 },
  'composer.grain': { required: false, ext: ['.png'], maxBytes: 24 * 1024 },
  'composer.frameBg': { required: false, ext: ['.png'], maxBytes: 300 * 1024 },
  'decor.sidebarEdge': { required: false, ext: ['.png', '.svg', '.webp'], maxBytes: 80 * 1024 },
  icon: { required: true, ext: ['.svg', '.png', '.webp'], maxBytes: 256 * 1024 },
}

const CAPABILITIES = new Set([
  'profileCard', 'rightRail', 'bottomBar', 'heroDecor',
  'hudLayer', 'noiseOverlay', 'copyReplace', 'logoReplace', 'customCss', 'composerFrame',
])

const DECOR_KINDS = new Set(['text', 'watermark', 'rail'])
const DECOR_ANCHORS = new Set([
  'hero.topLeft', 'hero.title', 'hero.subline', 'sidebar.card', 'rail', 'bottom',
])
const DECOR_FONTS = new Set(['text', 'code', 'brand'])
const DECOR_COLORS = new Set(['label-primary', 'label-secondary', 'label-tertiary'])
const CHAMFER_STYLES = new Set(['none', 'corner-cut', 'double-cut'])
const LOGO_MODES = new Set(['official', 'css-replace'])
const COPY_MODES = new Set(['official', 'css-replace'])
const COLOR_SCHEMES = new Set(['light', 'dark'])

const GEOMETRY_RULES = {
  frameInset: { type: 'number', min: 0, max: 64 },
  chamfer: { type: 'number', min: 0, max: 96 },
  chamferStyle: { type: 'enum', values: CHAMFER_STYLES },
  plateColor: { type: 'string' },
  sidebarAlpha: { type: 'number', min: 0, max: 1 },
  centerAlpha: { type: 'number', min: 0, max: 1 },
  heroCenterAlpha: { type: 'number', min: 0, max: 1 },
  composerPlateOffset: { type: 'number', min: 0, max: 32 },
  noiseOpacity: { type: 'number', min: 0, max: 0.2 },
  darkScrim: { type: 'number', min: 0, max: 0.9 },
  composerFrameSlice: { type: 'number', min: 16, max: 160 },
  composerFrameWidth: { type: 'number', min: 8, max: 64 },
  composerChrome: { type: 'enum', values: new Set(['css', 'frame', 'asset']) },
  portraitZoom: { type: 'number', min: 80, max: 300 },
  portraitFocusY: { type: 'number', min: 0, max: 100 },
  profilePortraitHeight: { type: 'number', min: 48, max: 260 },
  composerMaxWidth: { type: 'number', min: 420, max: 1000 },
  composerMinHeight: { type: 'number', min: 100, max: 320 },
  composerPaddingY: { type: 'number', min: 0, max: 60 },
  composerPaddingX: { type: 'number', min: 0, max: 60 },
  composerGlassAlpha: { type: 'number', min: 0, max: 1 },
}

const RECOMMENDED_TOKENS = [
  '--dsw-alias-bg-base', '--dsw-alias-label-primary', '--dsw-font-family',
]

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const ID_RE = /^[a-z0-9][a-z0-9-]*$/
const PERCENT_RE = /^-?\d+(?:\.\d+)?%$/
const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const CSS_LEN_RE = /^-?\d+(?:\.\d+)?(?:em|rem|px|%|ex|ch|vw|vh)?$/

/* ------------------------------- 诊断收集 ------------------------------- */

const diagnostics = []
const e = (path, msg) => diagnostics.push({ level: 'error', path, msg })
const w = (path, msg) => diagnostics.push({ level: 'warn', path, msg })

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v) => typeof v === 'string' && v.length > 0
const semverGt = (a, b) => {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}
const knownKeys = (obj, allowed, path) => {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) w(`${path}.${k}`, '未知字段（引擎会忽略，仅警告）')
  }
}

/* --------------------------------- 主流程 -------------------------------- */

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const allowMissing = flags.has('--allow-missing-files')
const asJson = flags.has('--json')
const packArg = args.find((a) => !a.startsWith('--'))
const packDir = resolve(packArg ?? join(REPO, 'packs/white-shark'))
const themePath = join(packDir, 'theme.json')

if (!existsSync(themePath)) {
  console.error(`validate-pack: 找不到 ${relative(REPO, themePath)}`)
  process.exit(2)
}

let pack
try {
  pack = JSON.parse(readFileSync(themePath, 'utf8'))
} catch (err) {
  console.error(`validate-pack: theme.json 解析失败: ${err.message}`)
  process.exit(2)
}

if (!isObject(pack)) {
  console.error('validate-pack: theme.json 顶层必须是对象')
  process.exit(2)
}

/* 1. 顶层字段 */
knownKeys(pack, TOP_KEYS, '')
for (const key of ['packVersion', 'id', 'meta', 'tokens', 'assets']) {
  if (!(key in pack)) e(key, '缺少必填字段')
}

/* 2. id / 版本 / 引擎门禁 */
if ('id' in pack) {
  if (!isStr(pack.id) || !ID_RE.test(pack.id)) e('id', '必须是 [a-z0-9-] 且非空')
  else if (pack.id !== basename(packDir)) e('id', `必须等于目录名（当前目录 ${basename(packDir)}）`)
}
if ('packVersion' in pack && !(isStr(pack.packVersion) && SEMVER.test(pack.packVersion))) {
  e('packVersion', '必须是 semver')
}
if ('minEngine' in pack) {
  if (!(isStr(pack.minEngine) && SEMVER.test(pack.minEngine))) e('minEngine', '必须是 semver')
  else if (semverGt(pack.minEngine, ENGINE_VERSION)) {
    e('minEngine', `要求引擎 ≥ ${pack.minEngine}，当前引擎契约版本 ${ENGINE_VERSION}`)
  }
}

/* 3. meta */
if ('meta' in pack) {
  const m = pack.meta
  if (!isObject(m)) e('meta', '必须是对象')
  else {
    knownKeys(m, META_KEYS, 'meta')
    if (!isObject(m.name) || !isStr(m.name.zh) || !isStr(m.name.en)) {
      e('meta.name', '必须是 {zh, en} 两个非空字符串')
    }
    if (!isStr(m.author)) e('meta.author', '必须是非空字符串')
    if (!isStr(m.version) || !SEMVER.test(m.version)) e('meta.version', '必须是 semver')
    if (!COLOR_SCHEMES.has(m.colorScheme)) e('meta.colorScheme', '必须是 light | dark')
  }
}

/* 4. tokens */
if ('tokens' in pack) {
  const t = pack.tokens
  if (!isObject(t)) e('tokens', '必须是对象')
  else {
    const keys = Object.keys(t)
    if (keys.length === 0) e('tokens', '至少声明一个 token')
    for (const [name, val] of Object.entries(t)) {
      const p = `tokens[${name}]`
      if (!name.startsWith('--')) e(p, 'token 名必须以 -- 开头')
      if (!isObject(val)) e(p, '值必须是 {light, dark} 对象')
      else {
        for (const mode of ['light', 'dark']) {
          if (!isStr(val[mode])) e(`${p}.${mode}`, '必须是字符串（两套必须齐备）')
        }
        for (const k of Object.keys(val)) {
          if (k !== 'light' && k !== 'dark') w(`${p}.${k}`, '未知字段（只接受 light / dark）')
        }
      }
    }
    for (const rec of RECOMMENDED_TOKENS) {
      if (!(rec in t)) w('tokens', `建议声明 ${rec}`)
    }
  }
}

/* 5. fonts（含文件存在性） */
const checkFile = (pathStr, relPath, maxBytes, extList) => {
  const p = `${pathStr}`
  if (!isStr(relPath)) {
    e(p, '必须是非空字符串路径')
    return
  }
  if (isAbsolute(relPath) || relPath.split('/').includes('..')) {
    e(p, '禁止绝对路径与 .. 逃逸')
    return
  }
  const ext = extname(relPath).toLowerCase()
  if (extList && !extList.includes(ext)) {
    e(p, `扩展名必须属于 ${extList.join(' / ')}（当前 ${ext || '无'}）`)
  }
  const abs = join(packDir, relPath)
  if (!existsSync(abs)) {
    if (allowMissing) w(p, `文件尚未生成：${relPath}`)
    else e(p, `文件不存在：${relPath}（素材未生成时可加 --allow-missing-files）`)
    return
  }
  const size = statSync(abs).size
  if (maxBytes && size > maxBytes) {
    e(p, `体积 ${(size / 1024).toFixed(1)} KB 超过上限 ${(maxBytes / 1024).toFixed(0)} KB`)
  }
}

if ('fonts' in pack) {
  if (!Array.isArray(pack.fonts)) e('fonts', '必须是数组')
  else {
    pack.fonts.forEach((f, idx) => {
      const p = `fonts[${idx}]`
      if (!isObject(f)) return e(p, '必须是对象')
      knownKeys(f, ['family', 'weight', 'style', 'src', 'display'], p)
      if (!isStr(f.family)) e(`${p}.family`, '必须是非空字符串')
      if (!isNum(f.weight)) e(`${p}.weight`, '必须是数字')
      if (f.style !== undefined && !['normal', 'italic'].includes(f.style)) {
        e(`${p}.style`, '必须是 normal | italic')
      }
      if (f.display !== undefined && !['auto', 'block', 'swap', 'fallback', 'optional'].includes(f.display)) {
        e(`${p}.display`, '非法 font-display')
      }
      checkFile(`${p}.src`, f.src, null, ['.woff2'])
    })
  }
}

/* 6. assets */
if ('assets' in pack) {
  const a = pack.assets
  if (!isObject(a)) e('assets', '必须是对象')
  else {
    for (const key of Object.keys(a)) {
      if (!(key in SLOT_RULES)) e(`assets.${key}`, `未知槽位（合法：${Object.keys(SLOT_RULES).join(', ')}）`)
    }
    for (const [slot, rule] of Object.entries(SLOT_RULES)) {
      if (rule.required && !(slot in a)) e(`assets.${slot}`, '必填槽位缺失')
      if (slot in a) checkFile(`assets.${slot}`, a[slot], rule.maxBytes, rule.ext)
    }
  }
}

/* 7. geometry */
if ('geometry' in pack) {
  const g = pack.geometry
  if (!isObject(g)) e('geometry', '必须是对象')
  else {
    knownKeys(g, Object.keys(GEOMETRY_RULES), 'geometry')
    for (const [name, rule] of Object.entries(GEOMETRY_RULES)) {
      if (!(name in g)) continue
      const v = g[name]
      const p = `geometry.${name}`
      if (rule.type === 'number') {
        if (!isNum(v)) e(p, '必须是数字')
        else if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
          e(p, `必须在 ${rule.min}–${rule.max} 之间（当前 ${v}）`)
        }
      } else if (rule.type === 'enum' && !rule.values.has(v)) {
        e(p, `必须是 ${[...rule.values].join(' | ')}`)
      } else if (rule.type === 'string' && !isStr(v)) {
        e(p, '必须是非空字符串')
      }
    }
    if ('plateColor' in g && isStr(g.plateColor) && !HEX_RE.test(g.plateColor) && !/^(rgb|hsl)a?\(/.test(g.plateColor)) {
      w('geometry.plateColor', '建议使用 hex / rgb() / hsl() 形式的颜色值')
    }
  }
}

/* 8. copy */
if ('copy' in pack) {
  const c = pack.copy
  if (!isObject(c)) e('copy', '必须是对象')
  else {
    knownKeys(c, ['mode', 'heroHeadline', 'heroSubline', 'placeholder', 'brandMicroline', 'statusLabel', 'profile'], 'copy')
    if (!COPY_MODES.has(c.mode)) e('copy.mode', '必须是 official | css-replace')
    for (const k of ['heroHeadline', 'heroSubline', 'placeholder', 'brandMicroline', 'statusLabel']) {
      if (k in c && !isStr(c[k])) e(`copy.${k}`, '必须是非空字符串')
    }
    if (c.mode === 'css-replace' && !['heroHeadline', 'heroSubline', 'placeholder'].some((k) => k in c)) {
      w('copy', 'css-replace 模式下没有替换任何字段')
    }
    if ('profile' in c) {
      const pr = c.profile
      if (!isObject(pr)) e('copy.profile', '必须是对象')
      else {
        knownKeys(pr, ['name', 'title', 'subtitle', 'label'], 'copy.profile')
        for (const k of ['name', 'subtitle', 'label']) {
          if (!isStr(pr[k])) e(`copy.profile.${k}`, '必须是非空字符串')
        }
      }
    }
  }
}

/* 9. decor */
if ('decor' in pack) {
  if (!Array.isArray(pack.decor)) e('decor', '必须是数组')
  else {
    if (pack.decor.length > 16) w('decor', '条目偏多（建议 ≤ 16）')
    pack.decor.forEach((d, idx) => {
      const p = `decor[${idx}]`
      if (!isObject(d)) return e(p, '必须是对象')
      knownKeys(d, ['kind', 'anchor', 'x', 'y', 'text', 'items', 'font', 'size', 'letterSpacing', 'lineHeight', 'opacity', 'color'], p)
      if (!DECOR_KINDS.has(d.kind)) e(`${p}.kind`, `必须是 ${[...DECOR_KINDS].join(' | ')}`)
      if (!DECOR_ANCHORS.has(d.anchor)) e(`${p}.anchor`, `必须是 ${[...DECOR_ANCHORS].join(' | ')}`)
      if (d.kind === 'rail' && d.anchor !== 'rail') e(`${p}.anchor`, 'rail 条目的 anchor 必须是 rail')
      if (d.kind === 'watermark' && d.anchor !== 'bottom') e(`${p}.anchor`, 'watermark 的 anchor 必须是 bottom')
      if ((d.kind === 'text' || d.kind === 'watermark')) {
        if (!isStr(d.text)) e(`${p}.text`, '必须是非空字符串')
        else if (d.text.length > 200) e(`${p}.text`, '长度不得超过 200')
      }
      if (d.kind === 'rail') {
        if (!Array.isArray(d.items) || d.items.length === 0) e(`${p}.items`, '必须是非空字符串数组')
        else if (d.items.length > 12) w(`${p}.items`, '条目偏多（建议 ≤ 12）')
        else if (!d.items.every(isStr)) e(`${p}.items`, '每一项都必须是非空字符串')
      }
      for (const axis of ['x', 'y']) {
        if (!(axis in d)) continue
        const v = d[axis]
        if (isNum(v)) continue
        if (isStr(v) && PERCENT_RE.test(v)) continue
        e(`${p}.${axis}`, '必须是数字（px）或百分比字符串（如 "12%"）')
      }
      if (d.font !== undefined && !DECOR_FONTS.has(d.font)) e(`${p}.font`, '必须是 text | code | brand')
      if (!isNum(d.size) || d.size <= 0 || d.size > 200) e(`${p}.size`, '必须是 1–200 的数字')
      if (d.opacity !== undefined && (!isNum(d.opacity) || d.opacity < 0 || d.opacity > 1)) {
        e(`${p}.opacity`, '必须在 0–1 之间')
      }
      if (d.letterSpacing !== undefined && !((isStr(d.letterSpacing) && CSS_LEN_RE.test(d.letterSpacing)) || isNum(d.letterSpacing))) {
        e(`${p}.letterSpacing`, '必须是 CSS 长度或数字')
      }
      if (d.lineHeight !== undefined && !((isStr(d.lineHeight) && CSS_LEN_RE.test(d.lineHeight)) || isNum(d.lineHeight))) {
        e(`${p}.lineHeight`, '必须是数字或 CSS 长度')
      }
      if (d.color !== undefined && !(DECOR_COLORS.has(d.color) || (isStr(d.color) && HEX_RE.test(d.color)))) {
        e(`${p}.color`, '必须是 label-primary | label-secondary | label-tertiary | #hex')
      }
    })
  }
}

/* 10. chrome */
if ('chrome' in pack) {
  const ch = pack.chrome
  if (!isObject(ch)) e('chrome', '必须是对象')
  else {
    knownKeys(ch, ['logoMode', 'brandLogo', 'dimWindowControls'], 'chrome')
    if (!LOGO_MODES.has(ch.logoMode)) e('chrome.logoMode', '必须是 official | css-replace')
    if (ch.dimWindowControls !== undefined && typeof ch.dimWindowControls !== 'boolean') {
      e('chrome.dimWindowControls', '必须是布尔值')
    }
  }
}

/* 11. capabilities */
if ('capabilities' in pack) {
  if (!Array.isArray(pack.capabilities)) e('capabilities', '必须是数组')
  else {
    const seen = new Set()
    for (const cap of pack.capabilities) {
      if (!CAPABILITIES.has(cap)) e('capabilities', `未知能力：${cap}`)
      if (seen.has(cap)) e('capabilities', `重复能力：${cap}`)
      seen.add(cap)
    }
  }
}

/* 12. customCss */
if ('customCss' in pack && pack.customCss !== null) {
  if (!isStr(pack.customCss)) e('customCss', '必须是字符串或 null')
  else checkFile('customCss', pack.customCss, null, ['.css'])
}

/* 13. 能力依赖一致性 */
const caps = new Set(Array.isArray(pack.capabilities) ? pack.capabilities : [])
const assets = isObject(pack.assets) ? pack.assets : {}
const decor = Array.isArray(pack.decor) ? pack.decor : []
const hasDecor = (kind) => decor.some((d) => isObject(d) && d.kind === kind)

const requireCap = (cap, why) => {
  if (!caps.has(cap)) e('capabilities', `${why} 需要能力 ${cap}，但未声明`)
}

if (isObject(pack.copy) && pack.copy.mode === 'css-replace') requireCap('copyReplace', 'copy.mode=css-replace')
if (isObject(pack.chrome) && pack.chrome.logoMode === 'css-replace') {
  requireCap('logoReplace', 'chrome.logoMode=css-replace')
  if (!assets.wordmark) e('chrome.brandLogo', 'css-replace 需要 assets.wordmark')
}
if (isStr(pack.customCss)) requireCap('customCss', 'customCss 字段')
if (isObject(pack.copy) && isObject(pack.copy.profile)) requireCap('profileCard', 'copy.profile')

/* 共存一致性：声明了能力但缺少数据（警告） */
const needAsset = (cap, slot) => {
  if (caps.has(cap) && !assets[slot]) w('assets', `能力 ${cap} 已声明，但缺少素材 assets.${slot}`)
}
needAsset('hudLayer', 'decor.hud')
needAsset('noiseOverlay', 'noise')
needAsset('composerFrame', 'composer.frame')
needAsset('profileCard', 'portrait')
if (caps.has('rightRail') && !hasDecor('rail')) w('decor', '能力 rightRail 已声明，但没有 rail 装饰条目')
if (caps.has('bottomBar') && !hasDecor('watermark')) w('decor', '能力 bottomBar 已声明，但没有 watermark 装饰条目')
if (caps.has('heroDecor') && !decor.some((d) => isObject(d) && d.anchor === 'hero.topLeft' || d.anchor === 'hero.title')) {
  w('decor', '能力 heroDecor 已声明，但没有 hero.* 锚点的装饰条目')
}
if (assets.portrait && !caps.has('profileCard')) w('assets.portrait', '存在 portrait 素材但未声明 profileCard 能力')
if (assets['decor.hud'] && !caps.has('hudLayer')) w('assets.decor.hud', '存在 decor.hud 素材但未声明 hudLayer 能力')
if (assets.noise && !caps.has('noiseOverlay')) w('assets.noise', '存在 noise 素材但未声明 noiseOverlay 能力')
if (assets['composer.frame'] && !caps.has('composerFrame')) w('assets.composer.frame', '存在 composer.frame 素材但未声明 composerFrame 能力')

/* -------------------------------- 输出 --------------------------------- */

const errors = diagnostics.filter((d) => d.level === 'error')
const warns = diagnostics.filter((d) => d.level === 'warn')

if (asJson) {
  console.log(JSON.stringify({
    pack: pack.id ?? basename(packDir),
    dir: relative(REPO, packDir),
    ok: errors.length === 0,
    errors,
    warnings: warns,
  }, null, 2))
} else {
  console.log(`validate-pack  ${relative(REPO, packDir)}`)
  console.log(`pack: ${pack.id ?? '?'}  v${pack.meta?.version ?? '?'}  packVersion ${pack.packVersion ?? '?'}  minEngine ${pack.minEngine ?? '-'}`)
  console.log('')
  for (const d of [...errors, ...warns]) {
    const tag = d.level === 'error' ? 'ERR ' : 'WARN'
    console.log(`  ${tag}  ${d.path || '(root)'}  ${d.msg}`)
  }
  console.log('')
  if (errors.length === 0) {
    console.log(`✅ PASS  ${errors.length} errors, ${warns.length} warnings`)
  } else {
    console.log(`❌ FAIL  ${errors.length} errors, ${warns.length} warnings`)
  }
}

process.exit(errors.length === 0 ? 0 : 1)
