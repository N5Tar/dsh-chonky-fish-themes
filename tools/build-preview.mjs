#!/usr/bin/env node
/**
 * build-preview — 由主题包生成「模拟 DSH 客户端」的静态预览 HTML。
 *
 * 目的：素材（图片 / CSS / 派生）产出后，立即在一个接近真实客户端结构的页面里验证，
 * 而不是只在设计稿里看。生成物在 preview/<pack-id>.html，可直接双击打开、也可复制改造成
 * 独立的主题演示页；结构刻意和真实 DSH 外壳一致（sidebar / main / chat / composer / decor）。
 *
 * 用法：node tools/build-preview.mjs [pack-id...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PACKS = join(ROOT, 'packs')
const OUT = join(ROOT, 'preview')

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const light = (tokens, key, fallback) => {
  const v = tokens[key]
  if (!v) return fallback
  return typeof v === 'string' ? v : (v.light || fallback)
}

function navItem(icon, label) {
  return `<div class="nav-item"><span class="nav-icon">${icon}</span><span>${esc(label)}</span></div>`
}

function sessionRow(label, time, active) {
  return `<div class="row session${active ? ' active' : ''}"><span class="diamond${active ? ' on' : ''}"></span><span class="row-title">${esc(label)}</span><span class="row-time">${esc(time)}</span></div>`
}

function build(packId) {
  const dir = join(PACKS, packId)
  const manifest = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8'))
  const t = manifest.tokens || {}
  const g = manifest.geometry || {}
  const copy = manifest.copy || {}
  const profile = copy.profile || {}
  const assets = manifest.assets || {}
  const has = (rel) => typeof rel === 'string' && existsSync(join(dir, rel))
  const url = (rel) => `../packs/${packId}/${rel}`

  const bg = has(assets['bg.main']) ? url(assets['bg.main']) : null
  const portrait = has(assets['portrait']) ? url(assets.portrait) : null
  const frameBg = has(assets['composer.frameBg']) ? url(assets['composer.frameBg']) : null
  const frame = has(assets['composer.frame']) ? url(assets['composer.frame']) : null

  const glassAlpha = typeof g.composerGlassAlpha === 'number' ? g.composerGlassAlpha : 0.78
  const glassBlur = typeof g.composerBlur === 'number' ? g.composerBlur : 11
  const glassInset = typeof g.composerGlassInset === 'number' ? g.composerGlassInset : 10
  const chatPadX = typeof g.chatGlassPadX === 'number' ? g.chatGlassPadX : 22
  const chatPadY = typeof g.chatGlassPadY === 'number' ? g.chatGlassPadY : 12
  // 包自定义样式里显式隐藏装甲导轨时，预览也不再画导轨（否则预览会展示主题实际不用的黑色导轨）。
  const customCssRel = typeof manifest.customCss === 'string' ? manifest.customCss : null
  let customCssText = ''
  if (customCssRel && Array.isArray(manifest.capabilities) && manifest.capabilities.includes('customCss')) {
    try { customCssText = readFileSync(join(dir, customCssRel), 'utf8') } catch { customCssText = '' }
  }
  const hideRail = /data-cf\s*=\s*["']armor-rail["'][^}]*display\s*:\s*none/.test(customCssText.replace(/\s+/g, ' '))
  const railW = hideRail ? 0 : (typeof g.railWidth === 'number' ? g.railWidth : 34)
  const composerW = typeof g.composerMaxWidth === 'number' ? g.composerMaxWidth : 720
  const composerH = typeof g.composerMinHeight === 'number' ? g.composerMinHeight : 150
  const padX = typeof g.composerPaddingX === 'number' ? g.composerPaddingX : 32
  const padY = typeof g.composerPaddingY === 'number' ? g.composerPaddingY : 18

  const railItems = (manifest.decor || []).find((d) => d && d.kind === 'rail')?.items || []
  const watermark = (manifest.decor || []).find((d) => d && d.kind === 'watermark')?.text || ''

  // 侧栏左缘：CSS/SVG 绘制（引擎内置方案），而不是图片
  const railSvg = `<svg width="100%" height="100%" viewBox="0 0 46 941" preserveAspectRatio="none">
    <path fill="rgba(13,15,19,0.23)" d="M0 0 H41 L22 22 V70 L52 86 V242 L22 258 V311 L41 325 V664 L24 681 V767 L0 790 Z" transform="translate(3 1)"/>
    <path fill="url(#steel)" d="M0 0 H37 L17 20 V72 L47 90 V238 L17 255 V312 L35 326 V664 L19 680 V767 L17 786 V915 L35 941 H0 Z"/>
    <path fill="#181b20" d="M0 0 H29 L12 18 V74 L42 93 V236 L13 252 V312 L30 328 V659 L14 677 V763 L14 779 V914 L27 940 H0 Z"/>
    <path fill="#292d32" d="M17 21 L24 14 L24 72 L47 90 L47 102 L16 78 Z M18 253 L29 246 L29 310 L35 326 L35 350 L18 314 Z M17 681 L27 670 L27 757 L18 767 Z"/>
    <path fill="none" stroke="#90969c" stroke-width="1.2" d="M36 1 L16 19 V71 L46 90 M46 238 L16 255 V312 L35 326 M35 664 L18 680 V766 L17 786"/>
  </svg>`

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(packId)} · DSH 预览</title>
<style>
:root{
  --bg-base:${light(t,'--dsw-alias-bg-base','#f4f4f5')};
  --layer1:${light(t,'--dsw-alias-bg-layer-1','#fff')};
  --layer2:${light(t,'--dsw-alias-bg-layer-2','#f7f7f8')};
  --sidebar-fill:${light(t,'--dsw-specific-sidebar-fill','#f7f8f7')};
  --input-major:${light(t,'--dsw-specific-input-major','rgba(255,255,255,.82)')};
  --label-1:${light(t,'--dsw-alias-label-primary','#1c1c1f')};
  --label-2:${light(t,'--dsw-alias-label-secondary','#6b6b70')};
  --label-3:${light(t,'--dsw-alias-label-tertiary','#9a9aa0')};
  --border-2:${light(t,'--dsw-alias-border-l2','rgba(28,28,31,.14)')};
  --border-3:${light(t,'--dsw-alias-border-l3','rgba(28,28,31,.2)')};
  --err:${light(t,'--dsw-alias-state-error-primary','#d92d20')};
  --accent:${light(t,'--cf-accent','#1c1c1f')};
  --accent-strong:${light(t,'--cf-accent-strong','#1c1c1f')};
  --accent-soft:${light(t,'--cf-accent-soft','rgba(28,28,31,.09)')};
  --accent-bar:${light(t,'--cf-accent','transparent')};
  --on-accent:${light(t,'--cf-on-accent','#ffffff')};
  --on-plate:${light(t,'--cf-on-plate',light(t,'--dsw-alias-label-primary','#1c1c1f'))};
  --on-plate-dim:${light(t,'--cf-on-plate-dim',light(t,'--dsw-alias-label-tertiary','#9a9aa0'))};
  --sidebar-alpha:${typeof g.sidebarAlpha === 'number' ? g.sidebarAlpha : 0.94};
  --center-alpha:${typeof g.centerAlpha === 'number' ? g.centerAlpha : 0.42};
  --glass-alpha:${glassAlpha};
  --glass-blur:${glassBlur}px;
  --glass-inset:${glassInset}px;
  --rail-w:${railW}px;
  --sidebar-pad-left:${hideRail ? '14px' : 'calc(var(--rail-w) + 8px)'};
  --chat-pad-x:${chatPadX}px;
  --chat-pad-y:${chatPadY}px;
  --composer-w:${composerW}px;
  --composer-h:${composerH}px;
  --composer-pad-x:${padX}px;
  --composer-pad-y:${padY}px;
}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{font-family:-apple-system,"PingFang SC","Noto Sans SC",system-ui,sans-serif;color:var(--label-1);background:var(--bg-base);overflow:hidden}
body::before{content:"";position:fixed;inset:0;z-index:-1;${bg ? `background-image:url("${bg}");background-size:cover;background-position:center;` : ''}}
.shell{position:relative;display:flex;height:100%;border:1px solid var(--border-2);border-radius:10px;overflow:hidden;background:transparent}
/* sidebar */
.sidebar{position:relative;width:280px;flex:none;background:color-mix(in srgb,var(--sidebar-fill) calc(var(--sidebar-alpha)*100%),transparent);border-right:1px solid var(--border-2);display:flex;flex-direction:column;padding:18px 14px 14px var(--sidebar-pad-left,calc(var(--rail-w) + 8px));gap:12px;overflow:hidden}
.rail{position:absolute;left:0;top:0;bottom:0;width:var(--rail-w)}
.brand{display:flex;align-items:flex-end;gap:10px}
.brand b{font-size:21px;font-weight:900;font-style:italic;letter-spacing:.01em}
.brand .divider{width:1px;height:22px;background:var(--border-3)}
.brand small{display:block;font-family:ui-monospace,monospace;font-size:8.5px;letter-spacing:.22em;color:var(--label-2)}
.brand .micro{font-family:ui-monospace,monospace;font-size:6.5px;letter-spacing:.16em;color:var(--label-3)}
.profile{position:relative;height:210px;border:1px solid var(--border-3);overflow:hidden;background:${portrait ? `url("${portrait}") center/cover no-repeat` : 'repeating-linear-gradient(45deg,rgba(28,28,31,.05) 0 5px,transparent 5px 11px)'}}
.profile .fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0) 28%,rgba(255,255,255,.9) 70%,rgba(255,255,255,.97) 100%)}
.profile .info{position:absolute;left:12px;right:12px;bottom:9px;display:flex;flex-direction:column;gap:2px}
.profile h2{margin:0;font-size:23px;line-height:1.1}
.profile p{margin:0;font-size:10.5px;color:var(--label-2)}
.profile .sign{font-family:"Snell Roundhand","HanziPen SC",cursive;font-size:19px;color:var(--label-2)}
.profile .meta{display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:8.5px;letter-spacing:.2em;color:var(--label-2);padding-top:4px}
.new-chat{border:1px solid var(--border-3);height:36px;display:grid;place-items:center;font-size:13px;background:color-mix(in srgb,var(--layer1) 70%,transparent)}
.nav{display:flex;flex-direction:column;gap:2px}
.nav-item{display:flex;align-items:center;gap:10px;height:30px;font-size:12.5px}
.nav-icon{width:18px;text-align:center;color:var(--label-2)}
.list{flex:1;min-height:0;overflow:auto;border-top:1px solid var(--border-2);padding-top:8px}
.list-head{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;letter-spacing:.06em;padding:4px 6px}
.list-head::before{content:"";width:5px;height:11px;background:var(--accent);clip-path:polygon(0 0,100% 50%,0 100%)}
.row{display:flex;align-items:center;gap:8px;height:29px;padding:0 6px;font-size:12px}
.row.project{height:30px;font-weight:600;font-size:12.5px}
.row.session{padding-left:20px;position:relative}
.row.session::before{content:"";position:absolute;left:9px;top:0;bottom:0;width:1px;background:var(--border-2)}
.diamond{position:absolute;left:6.5px;width:4px;height:4px;border:1px solid var(--border-3);background:var(--sidebar-fill);transform:rotate(45deg)}
.diamond.on{background:var(--accent);border-color:var(--accent)}
.row.active{background:var(--accent-soft);box-shadow:inset 2px 0 var(--accent-bar)}
.row-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-time{font-size:9px;letter-spacing:.06em;color:var(--label-3)}
.foot{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--label-2);padding-top:8px;border-top:1px solid var(--border-2)}
/* main */
.main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;background:linear-gradient(90deg,rgba(255,255,255,var(--center-alpha)) 0%,rgba(255,255,255,calc(var(--center-alpha)*.5)) 46%,rgba(255,255,255,0) 80%)}
.toolbar{display:flex;align-items:center;gap:14px;padding:14px 22px 0}
.toolbar .title{font-size:13px;font-weight:600}
.tabs{display:flex;gap:14px;margin-left:8px;font-size:12px;color:var(--label-2)}
.tabs .on{color:var(--label-1);border-bottom:2px solid var(--label-1);padding-bottom:6px}
.chat{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;padding:18px 24px 0}
.chat-col{width:100%;max-width:var(--composer-w);align-self:flex-start;background:rgba(248,249,250,var(--glass-alpha));backdrop-filter:blur(var(--glass-blur));border-radius:3px;padding:var(--chat-pad-y) var(--chat-pad-x);display:flex;flex-direction:column;gap:18px}
.msg{font-size:13.5px;line-height:1.75}
.msg.user{align-self:flex-end;background:rgba(28,28,31,.06);padding:8px 12px;border-radius:4px;max-width:78%}
.msg .who{font-family:ui-monospace,monospace;font-size:8.5px;letter-spacing:.2em;color:var(--label-3);margin-bottom:6px}
/* composer */
.composer-seat{display:flex;justify-content:center;padding:10px 24px 18px}
.composer{position:relative;width:100%;max-width:var(--composer-w);min-height:var(--composer-h);padding:var(--composer-pad-y) var(--composer-pad-x);display:flex;flex-direction:column;justify-content:space-between;gap:10px;${frameBg ? `background:url("${frameBg}") center/100% 100% no-repeat;` : `border:1px solid var(--border-3);`}}
.composer .glass{position:absolute;inset:var(--glass-inset);background:rgba(247,248,248,var(--glass-alpha));backdrop-filter:blur(var(--glass-blur));clip-path:polygon(2.2% 0,97.8% 0,100% 12%,100% 88%,97.8% 100%,2.2% 100%,0 88%,0 12%)}
.composer .placeholder{color:var(--on-plate-dim)}
.composer .square{border-color:color-mix(in srgb,var(--on-plate) 28%,transparent);color:var(--on-plate)}
.composer .placeholder{position:relative;color:var(--label-3);font-size:13px}
.composer .actions{position:relative;display:flex;align-items:center;gap:10px}
.square{width:32px;height:32px;border:1px solid var(--border-3);display:grid;place-items:center;font-size:15px;background:transparent}
.chip{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--err);background:rgba(217,45,32,.08);padding:5px 9px;border-radius:2px}
.model{margin-left:auto;font-size:12px;color:var(--on-plate-dim)}
.send{width:32px;height:32px;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;border-radius:2px}
.tune{position:absolute;left:50%;top:-18px;transform:translateX(-50%);width:68px;height:20px}
.tune span{position:absolute;inset:6px 0 0;background:linear-gradient(180deg,#383e43,#1b2025 28%,#14191d 86%,#2a3035);border:1px solid #626b72;clip-path:polygon(6px 0,calc(100% - 6px) 0,100% 5px,100% 100%,0 100%,0 5px)}
.tune i{position:absolute;left:50%;top:8px;width:6px;height:6px;border-top:2px solid #f6f7f8;border-left:2px solid #f6f7f8;transform:translateX(-50%) rotate(45deg)}
/* decor */
.rail-right{position:absolute;right:14px;top:12%;text-align:right;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.3em;color:rgba(28,28,31,.45);line-height:2;pointer-events:none}
.rail-right .num{font-size:15px;font-weight:700;color:rgba(28,28,31,.6)}
.watermark{position:absolute;left:20px;bottom:14px;font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.28em;color:rgba(28,28,31,.35)}
.status{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:26px;font-size:10px;color:var(--label-3);padding:6px 0;background:linear-gradient(180deg,transparent,rgba(255,255,255,.6))}
.packbar{position:fixed;right:10px;top:10px;z-index:9;font:11px ui-monospace,monospace;background:rgba(255,255,255,.85);border:1px solid var(--border-2);padding:6px 9px;letter-spacing:.08em}
</style></head>
<body>
<div class="packbar">PREVIEW · ${esc(packId)}</div>
<div class="shell">
  <aside class="sidebar">
    ${hideRail ? '' : `<div class="rail">${railSvg.replace('<svg ', '<svg ').replace('</svg>', `<defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#494e54"/><stop offset=".36" stop-color="#25292e"/><stop offset="1" stop-color="#15171a"/></linearGradient></defs></svg>`)}</div>`}
    <div class="brand"><b>DSH</b><div class="divider"></div><div><small>${esc(copy.statusLabel || 'LINK ACTIVE')}</small><div class="micro">${esc(copy.brandMicroline || 'DEEP · SMART · HUMAN')}</div></div></div>
    <div class="profile"><div class="fade"></div><div class="info">
      <h2>${esc(profile.name || '大肥鱼')}</h2>
      <p>${esc(profile.subtitle || '')}</p>
      ${profile.signature ? `<div class="sign">${esc(profile.signature)}</div>` : ''}
      <div class="meta"><span>${esc(profile.label || 'DSH ASSISTANT')}</span><span>/////</span></div>
    </div></div>
    <div class="new-chat">＋ 新会话</div>
    <div class="nav">${navItem('◈', '插件')}${navItem('◷', '自动化任务')}${navItem('◉', '大肥鱼')}${navItem('▤', '零花钱')}${navItem('☺', '人格')}${navItem('✧', '感知')}${navItem('▦', '日记')}${navItem('▣', '社交')}${navItem('❖', '更多')}</div>
    <div class="list"><div class="list-head">工作区</div>
      <div class="row project">▱ dsh-chonky-fish-docs</div>
      ${sessionRow('皮肤插件可行性与素材清单', '刚刚', true)}
      ${sessionRow('我想给大肥鱼接入邮箱的功能', '8小时', false)}
      ${sessionRow('创建 chonky-fish 私人仓库', '3天', false)}
      <div class="row project">▱ 小鱼塘</div>
      ${sessionRow('日常问候对话', '9小时', false)}
    </div>
    <div class="foot">⊙ 188****03<span style="margin-left:auto">设置</span></div>
  </aside>
  <main class="main">
    <div class="toolbar"><span class="title">皮肤插件可行性与素材清单</span><div class="tabs"><span class="on">对话</span><span>轨迹</span><span>···</span></div></div>
    <div class="chat"><div class="chat-col">
      <div class="msg user">这个皮肤的背景图能换成正常大小吗？</div>
      <div class="msg"><div class="who">DSH · ASSISTANT</div>背景用 <code>cover</code> 时会按窗口比例裁切；换成 <code>contain</code> 或按窗口比例出图都可以解决。这个预览页就是用来在真实结构里看素材效果的。</div>
    </div></div>
    <div class="composer-seat"><div class="composer">
      <div class="tune"><span></span><i></i></div>
      <div class="glass"></div>
      <div class="placeholder">发消息或创建任务，/ 调用指令，@ 文件或对话</div>
      <div class="actions"><div class="square">＋</div><div class="chip">⟳ 完全权限 ⌄</div><div class="model">DeepSeek-V4.1-Flash · 1017</div><div class="send">↑</div></div>
    </div></div>
    <div class="watermark">${esc(watermark)}</div>
    <div class="status"><span>◌ 66 轮 706 步</span><span>194 tok/s</span><span>◯ 234M tok</span><span>缓存命中 89.6%</span></div>
  </main>
  <div class="rail-right">${railItems.map((x) => `<div>${esc(x)}</div>`).join('')}</div>
</div>
</body></html>`
}

const wanted = process.argv.slice(2)
const ids = wanted.length > 0 ? wanted : readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
mkdirSync(OUT, { recursive: true })
for (const id of ids) {
  if (!existsSync(join(PACKS, id, 'theme.json'))) continue
  const html = build(id)
  writeFileSync(join(OUT, `${id}.html`), html)
  console.log(`preview/${id}.html`)
}
