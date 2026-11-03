/**
 * Client half of the Chonky Fish theme bundle (M1 skeleton).
 *
 * It loads `theme.json` from the Host route (`/skin/<pack>/theme.json`), then:
 * - applies palette / typography / shape tokens through the theme service;
 * - injects the engine stylesheet: geometry variables, background artwork,
 *   panel translucency, composer card shape, noise overlay, font faces.
 *
 * The pack data is the only variable: swapping `PACK_ID` (or the pack directory) must not
 * require touching this file. Overlay decorations (profile card, hero decor, right rail,
 * bottom bar) land in M2 through the slot system.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-chonky-fish-themes',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const DEFAULT_PACK = 'dafeiyu-mecha'
    const INDEX_ROUTE = '/skin/index.json'
    const PACK_ROUTE = (id) => '/skin/' + (id || DEFAULT_PACK) + '/'
    const DIAG_ROUTE = '/skin/__diag'
    const LOG = '[chonky-fish-themes]'

    /** 重量级诊断（全量 DOM 扫描）默认关闭；排障时在控制台执行 localStorage.setItem('cf-diag','1') 后刷新。 */
    function diagHeavy() {
      try { return localStorage.getItem('cf-diag') === '1' } catch (e) { return false }
    }

    function num(value, fallback) {
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    function assetUrl(rel, packId) {
      return typeof rel === 'string' && rel.length > 0 ? PACK_ROUTE(packId) + rel : null
    }
    /** 当前主题包 id（theme.id 优先，缺失时回退默认包）。 */
    function packIdOf(theme) {
      return theme && typeof theme.id === 'string' && theme.id ? theme.id : DEFAULT_PACK
    }

    function tint(varName, alpha) {
      if (!(alpha < 1)) return 'var(' + varName + ')'
      return 'color-mix(in srgb, var(' + varName + ') ' + Math.round(alpha * 100) + '%, transparent)'
    }

    /* ---------------------- decor overlay（hero 装饰 / 右栏 / 水印） ---------------------- */
    let currentTheme = null
    const themeSubs = new Set()
    function setTheme(next) {
      currentTheme = next
      for (const fn of themeSubs) fn()
    }
    function useTheme() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        const fn = () => force((n) => n + 1)
        themeSubs.add(fn)
        return () => themeSubs.delete(fn)
      }, [])
      return currentTheme
    }

    function rectOf(selector) {
      const el = document.querySelector(selector)
      return el ? el.getBoundingClientRect() : null
    }

    function computeAnchors() {
      const main = rectOf('div:has(> [data-slot="main"])')
      const sidebar = rectOf('div:has(> [data-slot="sidebar"])')
      const headline = rectOf('[data-content-phase="hero"] [class*="_headline"]')
      const m = main || { left: 0, top: 0, width: innerWidth, height: innerHeight }
      const anchors = {
        'hero.topLeft': { x: m.left + m.width * 0.02, y: m.top + m.height * 0.04, w: m.width, h: m.height },
        'hero.title': headline
          ? { x: headline.left, y: headline.top, w: headline.width, h: headline.height }
          : { x: m.left + m.width * 0.3, y: m.top + m.height * 0.34, w: m.width * 0.4, h: 40 },
        'hero.subline': { x: m.left + m.width * 0.3, y: m.top + m.height * 0.42, w: m.width * 0.4, h: 24 },
        rail: { x: m.left + m.width * 0.87, y: m.top + m.height * 0.1, w: m.width * 0.11, h: m.height },
        bottom: { x: m.left + m.width * 0.03, y: innerHeight - 54, w: m.width, h: 40 },
        'sidebar.card': sidebar
          ? { x: sidebar.left + 16, y: sidebar.top + 76, w: sidebar.width - 32, h: 230 }
          : { x: 16, y: 76, w: 260, h: 230 },
      }
      return anchors
    }

    function offsetPx(value, base) {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.endsWith('%')) return (parseFloat(value) / 100) * base
      return 0
    }
    function posPx(anchorValue, decorValue, base) {
      return (anchorValue + offsetPx(decorValue, base)).toFixed(1) + 'px'
    }

    const COLOR_VARS = {
      'label-primary': 'var(--dsw-alias-label-primary)',
      'label-secondary': 'var(--dsw-alias-label-secondary)',
      'label-tertiary': 'var(--dsw-alias-label-tertiary)',
    }
    const FONT_VARS = {
      text: 'var(--dsw-font-family)',
      code: 'var(--ds-font-family-code)',
      brand: 'var(--dsw-font-family-brand)',
    }

    function decorTextStyle(d) {
      return {
        position: 'absolute',
        fontFamily: FONT_VARS[d.font] || FONT_VARS.text,
        fontSize: (d.size || 12) + 'px',
        letterSpacing: d.letterSpacing || 'normal',
        lineHeight: d.lineHeight || 1.2,
        opacity: typeof d.opacity === 'number' ? d.opacity : 0.6,
        color: COLOR_VARS[d.color] || d.color || 'var(--dsw-alias-label-tertiary)',
        whiteSpace: 'pre-line',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    }

    /* ---- 主题包目录：默认（DSH 原生）/ 任意 packs/<id>（设置 → 通用 里的一行） ---- */
    const PACK_KEY = 'cf-theme-pack'
    const LEGACY_MODE_KEY = 'cf-theme-mode'

    function readActivePack() {
      try {
        const stored = localStorage.getItem(PACK_KEY)
        if (stored) return stored
        const legacy = localStorage.getItem(LEGACY_MODE_KEY)
        if (legacy === 'default') return 'default'
        return null // null = 未选择，运行时落到目录里的第一个主题
      } catch (e) {
        return null
      }
    }
    let activePack = readActivePack()
    let packCatalog = []
    let activeLocaleId = 'zh-CN'
    const packSubs = new Set()

    function notifyPacks() {
      for (const fn of Array.from(packSubs)) {
        try { fn() } catch (e) {}
      }
    }
    function setActivePack(next) {
      activePack = typeof next === 'string' && next ? next : null
      try {
        localStorage.setItem(PACK_KEY, activePack || '')
        localStorage.removeItem(LEGACY_MODE_KEY)
      } catch (e) {}
      notifyPacks()
    }
    function setPackCatalog(list) {
      packCatalog = Array.isArray(list) ? list : []
      notifyPacks()
    }
    /** 实际生效的包：'default' 表示回原生；null/失效时回退目录首个。 */
    function resolvePackId() {
      if (activePack === 'default') return null
      if (activePack && packCatalog.some((p) => p.id === activePack)) return activePack
      // 未选择时优先默认包，其次目录第一个
      if (packCatalog.some((p) => p.id === DEFAULT_PACK)) return DEFAULT_PACK
      return packCatalog.length > 0 ? packCatalog[0].id : null
    }
    function usePacks() {
      const [snap, setSnap] = React.useState({ catalog: packCatalog, active: activePack })
      React.useEffect(() => {
        const fn = () => setSnap({ catalog: packCatalog, active: activePack })
        packSubs.add(fn)
        return () => packSubs.delete(fn)
      }, [])
      return snap
    }
    /** 主题显示名：manifest 的 meta.name 是 {zh,en}；按当前界面语言取。 */
    function packLabel(pack) {
      const name = pack && pack.name
      if (!name) return (pack && pack.id) || ''
      if (typeof name === 'string') return name
      const zh = /^zh/i.test(activeLocaleId || '')
      return (zh ? name.zh : name.en) || name.zh || name.en || (pack && pack.id) || ''
    }

    /* ---- 本地化（复用宿主 locale 服务；缺字典时回退中文） ---- */
    const LOCALE_NS = 'chonky-fish-themes'
    const LOCALE_DICT = {
      zh: { 'theme.label': '主题', 'theme.default': '默认' },
      en: { 'theme.label': 'Theme', 'theme.default': 'Default' },
    }
    let translateRef = null
    const localeSubs = new Set()
    function t(key, fallback) {
      try {
        if (translateRef) {
          const v = translateRef(key)
          if (v && v !== key) return v
        }
      } catch (e) {}
      return fallback
    }
    function useLocaleVersion() {
      const [, setV] = React.useState(0)
      React.useEffect(() => {
        const fn = () => setV((n) => n + 1)
        localeSubs.add(fn)
        return () => localeSubs.delete(fn)
      }, [])
    }

    /** 设置 → 通用 里的一行：主题包选择（默认 DSH + 目录里的每个主题）。 */
    function ThemePackRow() {
      const { catalog, active } = usePacks()
      useLocaleVersion()
      const label = t('theme.label', '主题')
      const effective = active === 'default' ? 'default' : (resolvePackId() || 'default')
      const options = [
        { id: 'default', text: t('theme.default', '默认') },
        ...catalog.map((pack) => ({ id: pack.id, text: packLabel(pack) })),
      ]
      return h('div', {
        'data-skin-setting': 'theme-pack',
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          padding: '14px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)',
        },
      },
        h('span', { style: { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, label),
        h('div', {
          role: 'group', 'aria-label': label,
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px',
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '6px',
          },
        }, options.map((opt) => h('button', {
          key: opt.id,
          type: 'button',
          'aria-pressed': effective === opt.id,
          onClick: () => setActivePack(opt.id === 'default' ? 'default' : opt.id),
          style: {
            padding: '5px 12px', fontSize: '12px', lineHeight: 1.2, borderRadius: '4px', cursor: 'pointer',
            border: 0,
            background: effective === opt.id ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
            color: effective === opt.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
            fontWeight: effective === opt.id ? 600 : 400,
            boxShadow: effective === opt.id ? '0 1px 2px rgba(0,0,0,0.10)' : 'none',
          },
        }, opt.text))),
      )
    }

    /* ---- 透明度联动控件（完全对齐 demo .composer-tune / .tune-tab / .tune-panel） ---- */
    const GLASS_KEY = 'cf-glass-transparency'

    /** 主题包给出的默认值：composer 玻璃决定联动基准。 */
    function themeGlass(theme) {
      const g = (theme && theme.geometry) || {}
      const alpha = num(g.composerGlassAlpha, 0.78)
      return {
        pct: Math.round((1 - alpha) * 100),
        alpha,
        blur: num(g.composerBlur, 11),
        inset: num(g.composerGlassInset, 10),
      }
    }

    /** 用户覆盖（只在用户真的调过时存在）。 */
    function storedGlassPct() {
      try {
        const raw = localStorage.getItem(GLASS_KEY)
        if (raw === null || raw === '') return null
        const v = Number(raw)
        if (Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)))
      } catch (e) {}
      return null
    }

    function glassState(theme) {
      const base = themeGlass(theme)
      const pct = storedGlassPct()
      if (pct === null) return { pct: base.pct, alpha: base.alpha, blur: base.blur, overridden: false }
      const alpha = 1 - pct / 100
      return { pct, alpha, blur: Math.max(1, Math.round(12 * alpha)), overridden: true }
    }
    function GlassControl(props) {
      const [uid] = React.useState(() => 'cf-tune-' + Math.random().toString(36).slice(2, 8))
      const [pct, setPct] = React.useState(() => glassState(props.theme).pct)
      const [open, setOpen] = React.useState(false)
      const wrapRef = React.useRef(null)
      const closeTimer = React.useRef(null)
      const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
      const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 420) }
      React.useEffect(() => {
        const root = document.documentElement.style
        const alpha = 1 - pct / 100
        const blur = Math.max(1, Math.round(12 * alpha)) + 'px'
        root.setProperty('--cf-composer-alpha', String(alpha))
        root.setProperty('--cf-chat-alpha', String(alpha))
        root.setProperty('--cf-composer-blur', blur)
        root.setProperty('--cf-chat-blur', blur)
        try { localStorage.setItem(GLASS_KEY, String(pct)) } catch (e) {}
      }, [pct])
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKey)
          cancelClose()
        }
      }, [open])
      const r = props.rect
      // 宿主会为测高复制一份 DOM，隐藏副本里的 rect 在视口外：只让可见实例挂载
      if (!r || r.width < 80 || r.top < -200 || r.top > innerHeight + 200) return null
      const copy = props.copy || {}
      const width = Math.min(342, Math.max(200, r.width - 118))
      const leftRaw = r.left + r.width / 2 - width / 2
      const left = Math.max(8, Math.min(leftRaw, innerWidth - width - 8))
      const top = Math.max(8, r.top - 18)
      const dark = Boolean(props.isDark)
      const ink = dark ? '#cfd5da' : '#48515a'
      const shellBg = dark ? '#0d1013' : '#373d43'
      const faceBg = dark ? 'linear-gradient(#23272b,#1b1f23)' : 'linear-gradient(#fafafa,#e9ebed)'
      const barBg = dark ? '#23282d' : '#23282d'
      const trackIdle = dark ? '#2b3238' : '#b9c0c5'
      const trackFill = dark ? '#8b949b' : '#343b43'
      const valueInk = dark ? '#d7dde2' : '#465159'
      const closeInk = dark ? '#8b949b' : '#6d777e'
      const pctStyle = 'linear-gradient(90deg,' + trackFill + ' ' + pct + '%,' + trackIdle + ' ' + pct + '%)'
      return h('div', {
        ref: wrapRef,
        style: { position: 'fixed', left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(width) + 'px',
          height: '53px', pointerEvents: 'none', zIndex: 30, isolation: 'isolate' },
        onPointerEnter: cancelClose, onPointerLeave: scheduleClose,
      },
        h('button', {
          type: 'button',
          'aria-label': open ? (copy.collapse || '收起透明度滑块') : (copy.expand || '展开透明度滑块'),
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
          style: {
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '4px',
            height: '32px', width: '90px', padding: 0, border: 0, background: 'transparent',
            pointerEvents: open ? 'none' : 'auto', cursor: 'pointer', zIndex: 1,
          },
        },
          h('span', {
            style: {
              position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)',
              width: '68px', height: '14px', boxSizing: 'border-box', display: 'block',
              background: 'linear-gradient(180deg,#383e43 0%,#1b2025 28%,#14191d 86%,#2a3035 100%)',
              border: '1px solid #626b72',
              boxShadow: 'inset 0 1px 0 rgba(179,189,195,0.31), 0 1px 2px rgba(23,27,32,0.2)',
              clipPath: 'polygon(6px 0,calc(100% - 6px) 0,100% 5px,100% 100%,0 100%,0 5px)',
            },
          }),
          h('span', {
            style: {
              position: 'absolute', left: '50%', top: '9px', width: '6px', height: '6px',
              borderTop: '2px solid #f6f7f8', borderLeft: '2px solid #f6f7f8',
              transform: 'translateX(-50%) rotate(45deg)', filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.45))',
              display: 'block',
            },
          }),
        ),
        h('div', {
          'aria-hidden': !open,
          style: {
            position: 'absolute', inset: '1px 0 auto', height: '40px',
            opacity: open ? 1 : 0, visibility: open ? 'visible' : 'hidden',
            transform: open ? 'translateY(0) scaleX(1)' : 'translateY(7px) scaleX(0.965)',
            transition: 'opacity .15s ease,transform .2s cubic-bezier(.2,.75,.25,1),visibility 0s',
            pointerEvents: open ? 'auto' : 'none',
            filter: 'drop-shadow(0 3px 3px rgba(26,30,36,0.16))', zIndex: 3,
          },
        },
          h('div', {
            style: {
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 13px,12px 0,calc(100% - 12px) 0,100% 13px,100% 31px,calc(100% - 9px) 100%,9px 100%,0 31px)',
              background: shellBg,
            },
          }),
          h('div', {
            style: {
              position: 'absolute', inset: '1px',
              clipPath: 'polygon(0 12px,11px 0,calc(100% - 11px) 0,100% 12px,100% 29px,calc(100% - 8px) 100%,8px 100%,0 29px)',
              background: faceBg,
            },
          }),
          h('div', {
            style: { position: 'absolute', left: '30%', right: '30%', bottom: 0, height: '3px',
              background: barBg, clipPath: 'polygon(5px 0,calc(100% - 5px) 0,100% 100%,0 100%)' },
          }),
          h('div', {
            style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '9px', height: '100%',
              padding: '0 19px', zIndex: 1 },
          },
            h('svg', { width: 14, height: 14, viewBox: '0 0 20 20', fill: 'none', stroke: ink, strokeWidth: 1.6, style: { flex: 'none', color: ink } },
              h('circle', { cx: 10, cy: 10, r: 7.6 }),
              h('path', { d: 'M10 2.4v15.2a7.6 7.6 0 0 0 0-15.2Z', fill: ink, fillOpacity: 0.25, stroke: 'none' }),
            ),
            h('label', { htmlFor: uid + '-range', style: { fontSize: '11px', color: ink, whiteSpace: 'nowrap', letterSpacing: '0.08em', fontWeight: 650 } }, copy.label || '透明度'),
            h('input', {
              id: uid + '-range', type: 'range', min: 0, max: 100, step: 1, value: pct,
              'aria-label': copy.rangeLabel || '会话和 Composer 联动透明度，数值越大越透明',
              className: 'cf-tune-range',
              onChange: (e) => setPct(Number(e.target.value)),
              style: { flex: 1, minWidth: '32px', height: '3px', border: 0, appearance: 'none',
                WebkitAppearance: 'none', outline: 'none', background: pctStyle, cursor: 'ew-resize' },
            }),
            h('output', { style: { minWidth: '35px', textAlign: 'right',
              fontFamily: 'ui-monospace,SFMono-Regular,Consolas,monospace', fontSize: '11px', fontWeight: 650,
              color: valueInk, fontVariantNumeric: 'tabular-nums' } }, pct + '%'),
            h('button', {
              type: 'button', 'aria-label': copy.collapseTitle || '收起透明度设置', title: copy.collapseTitle || '收起', onClick: () => setOpen(false),
              style: { width: '21px', height: '21px', display: 'grid', placeItems: 'center', padding: 0,
                border: 0, background: 'transparent', color: closeInk, fontSize: '15px', lineHeight: 1,
                cursor: 'pointer', opacity: 0.76 },
            }, '×'),
          ),
        ),
      )
    }

    function DecorOverlay() {
      const theme = useTheme()
      const [, tick] = React.useState(0)
      React.useEffect(() => {
        const bump = () => tick((n) => n + 1)
        const scroller = document.querySelector('[data-slot="sidebar"] > div')
        const targets = [window, scroller].filter(Boolean)
        targets.forEach((t) => t.addEventListener('scroll', bump, { passive: true }))
        window.addEventListener('resize', bump)
        document.addEventListener('scroll', bump, true)
        // 布局变化（窗口尺寸、侧栏折叠、宿主重排）由观察器触发，不再靠定时轮询
        let observer = null
        try {
          observer = new ResizeObserver(bump)
          for (const sel of ['div:has(> [data-slot="sidebar"])', 'div:has(> [data-slot="main"])', '[data-composer-card]']) {
            const el = document.querySelector(sel)
            if (el) observer.observe(el)
          }
        } catch (e) {}
        return () => {
          if (observer) observer.disconnect()
          targets.forEach((t) => t.removeEventListener('scroll', bump))
          window.removeEventListener('resize', bump)
          document.removeEventListener('scroll', bump, true)
        }
      }, [])
      const cardRef = React.useRef(null)
      React.useLayoutEffect(() => {
        if (cardRef.current) {
          const hgt = Math.ceil(cardRef.current.getBoundingClientRect().height + 14)
          document.documentElement.style.setProperty('--cf-card-gap', hgt + 'px')
        }
      })
      const decor = theme && Array.isArray(theme.decor) ? theme.decor : []
      if (!theme) return null
      const anchors = computeAnchors()
      const inHero = Boolean(document.querySelector('[data-content-phase="hero"]'))
      const children = []
      const isDark = document.body.hasAttribute('data-ds-dark-theme')
      const ink = isDark ? 'rgba(240,242,245,0.92)' : 'rgba(28,28,31,0.92)'
      const inkSoft = isDark ? 'rgba(240,242,245,0.55)' : 'rgba(28,28,31,0.55)'
      const inkFaint = isDark ? 'rgba(240,242,245,0.35)' : 'rgba(28,28,31,0.35)'
      const lineClr = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(28,28,31,0.45)'
      const copy = (theme && theme.copy) || {}
      const RAIL_W = num(theme.geometry && theme.geometry.railWidth, 34)
      const edgeAssetUrl = (theme._available && theme._available.assets && theme._available.assets['decor.sidebarEdge'] && theme.assets && theme.assets['decor.sidebarEdge'])
        ? assetUrl(theme.assets['decor.sidebarEdge'], packIdOf(theme))
        : null
      const sidebarRect = rectOf('div:has(> [data-slot="sidebar"])')
      // 宿主测高副本里整棵树在视口外：跳过渲染，避免重复装饰与控制件
      if (sidebarRect && (sidebarRect.top < -innerHeight || sidebarRect.top > innerHeight * 2)) return null
      const brandRect = rectOf('[class*="_logoRow"]')
      const caps = Array.isArray(theme && theme.capabilities) ? theme.capabilities : []
      const portraitUrl = (theme && theme._available && theme._available.assets && theme._available.assets.portrait && theme.assets && theme.assets.portrait)
        ? assetUrl(theme.assets.portrait, packIdOf(theme))
        : null
      const portraitZoom = num(theme && theme.geometry && theme.geometry.portraitZoom, 170)
      const portraitFocusY = num(theme && theme.geometry && theme.geometry.portraitFocusY, 34)
      const profilePortraitHeight = num(theme && theme.geometry && theme.geometry.profilePortraitHeight, 84)

      if (sidebarRect) {
        const brandTop = brandRect ? brandRect.top + 5 : sidebarRect.top + 10
        const brandLeft = sidebarRect.left + RAIL_W + 10
        const label = copy.statusLabel || 'LINK ACTIVE'
        const sub = copy.brandMicroline || 'DEEP · SMART · HUMAN'
        children.push(h('div', {
          key: 'brand-block',
          style: {
            position: 'absolute', left: brandLeft + 'px', top: brandTop + 'px',
            width: Math.max(150, sidebarRect.width - RAIL_W - 22) + 'px',
            pointerEvents: 'none', userSelect: 'none',
            display: 'flex', alignItems: 'flex-end', gap: '10px',
          },
        },
          h('div', {
            style: {
              fontFamily: 'var(--dsw-font-family-brand)', fontSize: '21px', fontWeight: 900,
              fontStyle: 'italic', letterSpacing: '0.01em', lineHeight: 1, color: ink,
            },
          }, 'DSH'),
          h('div', { style: { width: '1px', height: '22px', background: lineClr, opacity: 0.8 } }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', paddingBottom: '1px' } },
            h('div', { style: { fontFamily: 'var(--ds-font-family-code)', fontSize: '8.5px', fontWeight: 600, letterSpacing: '0.22em', color: ink, opacity: 0.85 } }, label),
            h('div', { style: { fontFamily: 'var(--ds-font-family-code)', fontSize: '6.5px', letterSpacing: '0.16em', color: inkSoft } }, sub),
          ),
          h('div', {
            style: {
              marginLeft: 'auto', marginRight: '2px', width: '15px', height: '15px',
              border: '1px solid ' + lineClr, position: 'relative', flex: 'none',
            },
          },
            h('div', {
              style: {
                position: 'absolute', left: '3px', right: '3px', bottom: '3px', height: '1px',
                background: inkSoft,
              },
            }),
            h('div', {
              style: {
                position: 'absolute', right: '3px', top: '3px', width: '7px', height: '7px',
                borderRight: '1px solid ' + inkSoft, borderBottom: '1px solid ' + inkSoft,
              },
            }),
          ),
        ))
      }

      // 侧栏底部装甲条（demo bottom-armor），叠在左下角，纯装饰
      if (sidebarRect) {
        const armorH = 38
        children.push(h('div', {
          key: 'bottom-armor',
          style: {
            position: 'absolute', left: sidebarRect.left + 'px',
            top: (sidebarRect.top + sidebarRect.height - armorH) + 'px',
            width: sidebarRect.width + 'px', height: armorH + 'px',
            pointerEvents: 'none', zIndex: 2, overflow: 'hidden',
          },
        }, h('svg', {
          viewBox: '0 0 307 46', preserveAspectRatio: 'none', width: '100%', height: '100%',
          style: { display: 'block' },
        },
          h('path', { fill: '#191c21', d: 'M0 10 L18 25 L35 42 H281 L307 46 H0 Z' }),
          h('path', { fill: '#34383d', d: 'M0 10 L18 26 L35 41 H281 L286 43 H34 Z' }),
          h('path', { stroke: '#92999f', strokeWidth: 1, fill: 'none', d: 'M1 10 L18 26 L35 41 H281' }),
        )))
      }

      // 侧栏左缘机械装甲导轨（SVG 路径，参考 dsh-mechanical-sidebar-demo）
      if (sidebarRect && caps.includes('profileCard')) {
        const rail = edgeAssetUrl ? h('div', {
          key: 'armor-rail-asset',
          style: { width: '100%', height: '100%',
            background: 'url("' + edgeAssetUrl + '") left top/100% 100% no-repeat' },
        }) : h('svg', {
          key: 'armor-rail',
          viewBox: '0 0 46 941', preserveAspectRatio: 'none',
          width: RAIL_W, height: '100%', style: { display: 'block' },
        },
          h('defs', null, h('linearGradient', { id: 'cfSteel', x1: '0', x2: '1' },
            h('stop', { offset: '0', stopColor: '#494e54' }),
            h('stop', { offset: '0.36', stopColor: '#25292e' }),
            h('stop', { offset: '1', stopColor: '#15171a' }),
          )),
          h('path', { fill: 'rgba(13,15,19,0.23)', d: 'M0 0 H41 L22 22 V70 L52 86 V242 L22 258 V311 L41 325 V664 L24 681 V767 L0 790 Z', transform: 'translate(3 1)' }),
          h('path', { fill: 'url(#cfSteel)', d: 'M0 0 H37 L17 20 V72 L47 90 V238 L17 255 V312 L35 326 V664 L19 680 V767 L17 786 V915 L35 941 H0 Z' }),
          h('path', { fill: '#181b20', d: 'M0 0 H29 L12 18 V74 L42 93 V236 L13 252 V312 L30 328 V659 L14 677 V763 L14 779 V914 L27 940 H0 Z' }),
          h('path', { fill: '#292d32', d: 'M17 21 L24 14 L24 72 L47 90 L47 102 L16 78 Z M18 253 L29 246 L29 310 L35 326 L35 350 L18 314 Z M17 681 L27 670 L27 757 L18 767 Z' }),
          h('path', { fill: '#373c42', opacity: '0.6', d: 'M42 94 V236 L38 241 V93 Z M29 330 H35 V661 L29 668 Z' }),
          h('path', { fill: 'none', stroke: '#90969c', strokeWidth: '1.2', d: 'M36 1 L16 19 V71 L46 90 M46 238 L16 255 V312 L35 326 M35 664 L18 680 V766 L17 786' }),
          h('path', { fill: 'none', stroke: '#5c646c', strokeWidth: '1', opacity: '0.9', d: 'M20 29 V66 M43 109 V171 M43 179 V217 M19 265 V302 M32 341 V374 M31 641 V656 M20 691 V722 M20 739 V758' }),
          h('path', { fill: '#717b85', opacity: '0.76', d: 'M23 684 L29 676 L29 690 L23 700 Z M23 748 L29 740 V763 L23 767 Z' }),
          h('path', { fill: '#adb5bd', d: 'M24 687 L25 685 V697 L24 698 Z M24 751 L25 748 V757 L24 758 Z' }),
          h('path', { fill: 'rgba(225,229,231,0.45)', d: 'M18 704 L19 701 V729 L18 730 Z' }),
        )
        children.push(h('div', {
          key: 'armor-rail-wrap',
          style: {
            position: 'absolute', left: sidebarRect.left + 'px', top: sidebarRect.top + 'px',
            width: RAIL_W + 'px', height: sidebarRect.height + 'px',
            pointerEvents: 'none', zIndex: 1, overflow: 'hidden',
          },
        }, rail))
      }

      if (sidebarRect && caps.includes('profileCard') && copy.profile) {
        const cardW = Math.max(180, sidebarRect.width - RAIL_W - 24)
        const cardH = profilePortraitHeight
        children.push(h('div', {
          key: 'profile-card',
          ref: cardRef,
          style: {
            position: 'absolute', left: (sidebarRect.left + RAIL_W + 12) + 'px',
            top: ((brandRect ? brandRect.bottom + 8 : sidebarRect.top + 64)) + 'px',
            width: cardW + 'px', height: cardH + 'px',
            boxSizing: 'border-box', overflow: 'hidden',
            border: '1px solid ' + lineClr,
            clipPath: 'polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)',
            pointerEvents: 'none', userSelect: 'none',
            backgroundImage: portraitUrl
              ? 'url("' + portraitUrl + '")'
              : 'repeating-linear-gradient(45deg,rgba(28,28,31,0.05) 0 5px,transparent 5px 11px)',
            backgroundSize: portraitUrl ? ((portraitZoom <= 100 ? 'cover' : portraitZoom + '% auto')) : 'auto',
            backgroundPosition: portraitUrl ? ('center ' + portraitFocusY + '%') : 'center',
            backgroundRepeat: 'no-repeat',
          },
        },
          // 右下条码带（参考 demo 的 avatar-stripes）
          h('div', {
            style: {
              position: 'absolute', right: 0, bottom: 0, width: '72px', height: '9px',
              background: 'repeating-linear-gradient(120deg,' + (isDark ? '#e8ecef' : '#14181d') + ' 0 7px,transparent 7px 13px)',
              opacity: 0.85,
            },
          }),
          // 底部渐隐，保证文字在图上可读
          h('div', {
            style: {
              position: 'absolute', inset: 0,
              backgroundImage: isDark
                ? 'linear-gradient(180deg,rgba(14,16,20,0) 28%,rgba(14,16,20,0.88) 72%,rgba(14,16,20,0.96) 100%)'
                : 'linear-gradient(180deg,rgba(255,255,255,0) 28%,rgba(255,255,255,0.90) 70%,rgba(255,255,255,0.97) 100%)',
            },
          }),
          h('div', {
            style: { position: 'absolute', left: '12px', right: '12px', bottom: '9px', display: 'flex', flexDirection: 'column', gap: '2px' },
          },
            h('div', { style: { fontFamily: 'var(--dsw-font-family-brand)', fontSize: '23px', fontWeight: 700, lineHeight: 1.1, color: ink, letterSpacing: '0.02em' } }, copy.profile.name),
            copy.profile.subtitle ? h('div', { style: { fontSize: '10.5px', color: inkSoft, lineHeight: 1.4 } }, copy.profile.subtitle) : null,
            copy.profile.signature ? h('div', { style: { fontFamily: '"Snell Roundhand", "HanziPen SC", "Hannotate SC", "Bradley Hand", cursive', fontSize: '19px', color: inkSoft, opacity: 0.92, marginTop: '-1px' } }, copy.profile.signature) : null,
            h('div', { style: { paddingTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { style: { fontFamily: 'var(--ds-font-family-code)', fontSize: '8.5px', letterSpacing: '0.2em', color: inkSoft } }, copy.profile.label || ''),
              h('span', { style: { fontFamily: 'var(--ds-font-family-code)', fontSize: '8.5px', letterSpacing: '0.2em', color: inkFaint } }, '/////'),
            ),
          ),
        ))
      }
      decor.forEach((d, i) => {
        const anchor = anchors[d.anchor]
        if (!anchor) return
        const heroAnchor = String(d.anchor).indexOf('hero.') === 0
        if (heroAnchor && !inHero) return
        if (d.kind === 'text') {
          children.push(h('div', {
            key: 'decor-' + i,
            'data-skin-decor': String(i),
            style: {
              ...decorTextStyle(d),
              left: posPx(anchor.x, d.x, anchor.w),
              top: posPx(anchor.y, d.y, anchor.h),
            },
          }, d.text))
        } else if (d.kind === 'rail') {
          children.push(h('div', {
            key: 'decor-' + i,
            'data-skin-decor': String(i),
            style: {
              ...decorTextStyle(d),
              right: '14px', top: anchor.y + 'px', textAlign: 'right',
              display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap',
            },
          }, (d.items || []).map((item, j) => h('div', { key: 'rail-' + j }, item))))
        } else if (d.kind === 'watermark') {
          children.push(h('div', {
            key: 'decor-' + i,
            'data-skin-decor': String(i),
            style: { ...decorTextStyle(d), left: anchor.x + 'px', top: anchor.y + 'px' },
          }, d.text))
        }
      })
      const composerRect = rectOf('[data-composer-card]')
      const tuneCopy = copy.tune || {}

      return h(React.Fragment, null,
        h('div', {
          style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' },
          'aria-hidden': true,
        }, children),
        h('div', {
          key: 'skin-controls',
          style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 6, overflow: 'hidden' },
          role: 'group',
          'aria-label': tuneCopy.groupLabel || '界面透明度设置',
        }, h(GlassControl, {
          key: 'glass-control', rect: composerRect, theme, ink, inkSoft, lineClr, isDark, copy: tuneCopy,
        })),
      )
    }

    function collectCardInfo() {
      try {
        const el = document.querySelector('[data-composer-card]')
        if (!el) return { card: 'absent' }
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return {
          card: 'present',
          size: Math.round(rect.width) + 'x' + Math.round(rect.height),
          borderTopWidth: cs.borderTopWidth,
          borderImageSource: String(cs.borderImageSource).slice(0, 120),
          borderImageSlice: String(cs.borderImageSlice),
          borderRadius: cs.borderRadius,
          backgroundColor: cs.backgroundColor,
          backgroundImage: String(cs.backgroundImage).slice(0, 120),
          paddingTop: cs.paddingTop,
        }
      } catch (err) {
        return { card: 'error', message: String((err && err.message) || err) }
      }
    }

    /** 临时诊断上报：Client → 宿主日志（无浏览器控制时定位渲染问题）。 */
    function collectLayoutInfo() {
      const out = []
      const add = (label, el) => {
        if (!el) { out.push({ label, found: false }); return }
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        out.push({
          label, tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
          bg: cs.backgroundColor, bgImg: String(cs.backgroundImage).slice(0, 60),
          size: Math.round(r.width) + 'x' + Math.round(r.height),
        })
      }
      const beforeCs = getComputedStyle(document.body, '::before')
      out.push({ label: 'body::before', bgImg: String(beforeCs.backgroundImage).slice(0, 80), pos: beforeCs.position, z: beforeCs.zIndex })
      add('html', document.documentElement)
      add('body', document.body)
      add('#root', document.getElementById('root'))
      add('rootSlot', document.querySelector('[data-slot="root"]'))
      const rb = document.querySelector('[data-rightbar-col]')
      add('rightbarCol', rb)
      add('rightbarParent', rb && rb.parentElement)
      add('sidebarCol', document.querySelector('div:has(> [data-slot="sidebar"])'))
      add('mainCol', document.querySelector('div:has(> [data-slot="main"])'))
      add('sidebarSlot', document.querySelector('[data-slot="sidebar"]'))

      // 扫描「接近满屏且有不透明背景」的元素——找出盖住底图的层
      const vw = innerWidth, vh = innerHeight
      const opaqueLayers = []
      for (const el of document.querySelectorAll('div,main,section,header,footer,aside,nav')) {
        const r = el.getBoundingClientRect()
        if (r.width * r.height < 0.5 * vw * vh) continue
        const cs = getComputedStyle(el)
        const bg = cs.backgroundColor
        const bgImg = String(cs.backgroundImage)
        if ((bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || bgImg !== 'none') {
          opaqueLayers.push({
            cls: String(el.className || '').slice(0, 50),
            size: Math.round(r.width) + 'x' + Math.round(r.height),
            bg, bgImg: bgImg.slice(0, 60),
            pos: cs.position, z: cs.zIndex, op: cs.opacity,
          })
        }
        if (opaqueLayers.length >= 8) break
      }
      out.push({ label: 'opaqueLayers', count: opaqueLayers.length, layers: opaqueLayers })

      // composer 卡片的祖先链
      const chain = []
      let cur = document.querySelector('[data-composer-card]')
      while (cur && chain.length < 14) {
        const cs = getComputedStyle(cur)
        const r = cur.getBoundingClientRect()
        chain.push({
          cls: String(cur.className || '').slice(0, 46),
          attrs: Array.from(cur.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).slice(0, 4).join(' ').slice(0, 70),
          size: Math.round(r.width) + 'x' + Math.round(r.height),
          bg: cs.backgroundColor, bgImg: String(cs.backgroundImage).slice(0, 40),
          op: cs.opacity, iso: cs.isolation, pos: cs.position,
        })
        cur = cur.parentElement
      }
      out.push({ label: 'ancestorChain', chain })

      // hero headline 候选元素
      const cands = []
      for (const el of document.querySelectorAll('[class*="_headline"], [class*="titleGroup"], [class*="_stack"]')) {
        const r = el.getBoundingClientRect()
        cands.push({ cls: String(el.className || '').slice(0, 40), rect: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height), text: String(el.textContent || '').slice(0, 24) })
      }
      out.push({ label: 'headlineCandidates', cands: cands.slice(0, 8) })
      const decors = []
      for (const el of document.querySelectorAll('[data-skin-decor]')) {
        const r = el.getBoundingClientRect()
        decors.push({ i: el.getAttribute('data-skin-decor'), rect: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height), text: String(el.textContent || '').slice(0, 20) })
      }
      out.push({ label: 'decorNodes', count: decors.length, nodes: decors.slice(0, 8) })
      out.push({ label: 'anchors', anchors: computeAnchors() })
      out.push({ label: 'decorData', data: (currentTheme && currentTheme.decor || []).map((d) => ({ kind: d.kind, anchor: d.anchor, x: d.x, y: d.y })) })

      // 侧栏滚动诊断
      const sbCol = document.querySelector('div:has(> [data-slot="sidebar"])')
      const sbRoot = document.querySelector('[data-slot="sidebar"] > div')
      const sbInfo = (el, name) => {
        if (!el) return { name, found: false }
        const cs = getComputedStyle(el)
        return { name, cls: String(el.className || '').slice(0, 40), h: el.clientHeight, sh: el.scrollHeight,
          overflowY: cs.overflowY, display: cs.display, flex: cs.flex, minH: cs.minHeight, maxH: cs.maxHeight }
      }
      const chatP = document.querySelector('[data-conversation-content] p, [data-conversation-region="chat"] p')
      const bodyCs = getComputedStyle(document.body)
      out.push({ label: 'darkCheck', bodyDark: document.body.hasAttribute('data-ds-dark-theme'),
        labelPrimary: bodyCs.getPropertyValue('--dsw-alias-label-primary').trim(),
        bgBase: bodyCs.getPropertyValue('--dsw-alias-bg-base').trim(),
        chatColor: chatP ? getComputedStyle(chatP).color : null })
      const probe = (x, y) => {
        try {
          return document.elementsFromPoint(x, y).slice(0, 6).map((el) => {
            const cs = getComputedStyle(el)
            return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 36), attrs: Array.from(el.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name).slice(0, 3).join(','), bg: cs.backgroundColor, bgImg: String(cs.backgroundImage).slice(0, 40) }
          })
        } catch (e) { return [{ error: String(e) }] }
      }
      const bgAt = (x, y) => Array.from(document.querySelectorAll('*')).filter((el) => {
        const r = el.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
        const cs = getComputedStyle(el)
        return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || String(cs.backgroundImage) !== 'none'
      }).slice(-8).map((el) => {
        const cs = getComputedStyle(el)
        return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 30), bg: cs.backgroundColor, img: String(cs.backgroundImage).slice(0, 44) }
      })
      out.push({ label: 'bgAtBottom', items: bgAt(Math.round(innerWidth * 0.5), Math.round(innerHeight - 14)) })
      const pseudoAt = (x, y) => {
        const out = []
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
          for (const pe of ['::before', '::after']) {
            try {
              const cs = getComputedStyle(el, pe)
              const has = (cs.content && cs.content !== 'none' && cs.content !== 'normal') || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') || String(cs.backgroundImage) !== 'none'
              if (!has) continue
              if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && String(cs.backgroundImage) === 'none') continue
              out.push({ cls: String(el.className || '').slice(0, 28), pe, bg: cs.backgroundColor, img: String(cs.backgroundImage).slice(0, 44), content: String(cs.content).slice(0, 12) })
            } catch (e) {}
          }
        }
        return out.slice(0, 8)
      }
      const seat = document.querySelector('[data-composer-seat]')
      out.push({ label: 'seatBg', bg: seat ? getComputedStyle(seat).backgroundImage : null, bgColor: seat ? getComputedStyle(seat).backgroundColor : null })
      out.push({ label: 'pseudoAtBottom', items: pseudoAt(Math.round(innerWidth * 0.5), Math.round(innerHeight - 14)) })
      out.push({ label: 'bottomProbe', bottom: probe(Math.round(innerWidth * 0.5), Math.round(innerHeight - 24)), belowComposer: probe(Math.round(innerWidth * 0.5), Math.round(innerHeight - 110)) })
      const rows = Array.from(document.querySelectorAll('[data-row-key]')).slice(0, 3).map((el) => {
        const r = el.getBoundingClientRect()
        return {
          key: el.getAttribute('data-row-key'),
          size: Math.round(r.width) + 'x' + Math.round(r.height),
          html: String(el.outerHTML).replace(/\s+/g, ' ').slice(0, 900),
        }
      })
      const sectionHdr = Array.from(document.querySelectorAll('div:has(> [data-slot="sidebar.workspaces"]) [class*="_section"]')).slice(0, 3).map((el) => String(el.outerHTML).replace(/\s+/g, ' ').slice(0, 220))
      const settingsRow = Array.from(document.querySelectorAll('[data-slot="sidebar"] [class*="_foot"], [data-slot="sidebar"] [class*="_settings"]')).slice(0, 3).map((el) => String(el.outerHTML).replace(/\s+/g, ' ').slice(0, 200))
      out.push({ label: 'sidebarDetail', rows, sectionHdr, settingsRow })
      const content = document.querySelector('[data-conversation-content]')
      const msgRows = []
      if (content) {
        const walk = (el, depth) => {
          if (depth > 6 || msgRows.length > 24) return
          for (const ch of el.children) {
            const cls = String(ch.className || '')
            if (/message|turn|user|assistant|row/i.test(cls) || ch.getAttribute('data-message-role')) {
              const r = ch.getBoundingClientRect()
              msgRows.push({ tag: ch.tagName.toLowerCase(), cls: cls.slice(0, 60), attrs: Array.from(ch.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + String(a.value).slice(0, 12)).slice(0, 4).join(','), size: Math.round(r.width) + 'x' + Math.round(r.height) })
            }
            walk(ch, depth + 1)
          }
        }
        walk(content, 0)
      }
      const skel = []
      const contentEl = document.querySelector('[data-conversation-content]')
      const walkSkel = (el, depth) => {
        if (depth > 12 || skel.length > 70) return
        for (const ch of el.children) {
          skel.push(depth + ' ' + ch.tagName.toLowerCase() + ' ' + String(ch.className || '').slice(0, 40))
          walkSkel(ch, depth + 1)
        }
      }
      if (contentEl) walkSkel(contentEl, 0)
      out.push({ label: 'msgSkeleton', count: skel.length, skel })
      const convEls = Array.from(document.querySelectorAll('[data-conversation-region], [data-conversation-content], [data-conversation-scroll]')).map((el) => {
        const r = el.getBoundingClientRect()
        return { region: el.getAttribute('data-conversation-region'), cls: String(el.className || '').slice(0, 36), size: Math.round(r.width) + 'x' + Math.round(r.height), kids: el.children.length }
      })
      out.push({ label: 'convEls', convEls })
      const tree = []
      const walkAll = (el, depth) => {
        if (depth > 9 || tree.length > 80) return
        for (const ch of el.children) {
          const r = ch.getBoundingClientRect()
          tree.push({ d: depth, tag: ch.tagName.toLowerCase(), cls: String(ch.className || '').slice(0, 44), attrs: Array.from(ch.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name).slice(0, 3).join(','), size: Math.round(r.width) + 'x' + Math.round(r.height) })
          walkAll(ch, depth + 1)
        }
      }
      const frame = document.querySelector('[data-conversation-content] [class*="_frame"]')
      if (frame) walkAll(frame, 0)
      out.push({ label: 'messageTree', count: tree.length, tree })
      try {
        const btns = Array.from(document.querySelectorAll('button[aria-label*="透明度"]'))
        out.push({ label: 'tuneCount', count: btns.length,
          rects: btns.map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)] }) })
        const btn = btns[0]
        if (btn) {
          const r = btn.getBoundingClientRect()
          const cx = Math.round(r.left + r.width / 2)
          const cy = Math.round(r.top + r.height / 2)
          const hit = document.elementFromPoint(cx, cy)
          out.push({ label: 'tuneHit', rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            point: [cx, cy], hitTag: hit ? hit.tagName.toLowerCase() : null, hitLabel: hit ? (hit.getAttribute('aria-label') || '') : null })
        } else {
          out.push({ label: 'tuneHit', rect: null })
        }
      } catch (e) { out.push({ label: 'tuneHit', error: String(e) }) }
      out.push({ label: 'sidebarScroll', col: sbInfo(sbCol, 'col'), root: sbInfo(sbRoot, 'root'), region: sbInfo(document.querySelector('[data-slot="sidebar.workspaces"]'), 'region') })
      out.push({ label: 'phase', hero: Boolean(document.querySelector('[data-content-phase="hero"]')), phaseEl: (document.querySelector('[data-content-phase]') || {}).getAttribute ? document.querySelector('[data-content-phase]').getAttribute('data-content-phase') : null })
      return out
    }

    function diag(payload) {
      try {
        fetch(DIAG_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            themeId: packIdOf(theme),
            href: location.href,
            origin: location.origin,
            ua: navigator.userAgent,
            ...payload,
          }),
          keepalive: true,
        }).catch(() => {})
      } catch {
        /* diagnostics never throw */
      }
    }

    function fontFaces(theme) {
      const available = (theme._available && theme._available.fonts) || {}
      const entries = Array.isArray(theme.fonts) ? theme.fonts : []
      return entries
        .filter((f) => f && available[f.src])
        .map((f) => {
          const weight = num(f.weight, 400)
          const style = typeof f.style === 'string' ? f.style : 'normal'
          const display = typeof f.display === 'string' ? f.display : 'swap'
          return (
            '@font-face{font-family:"' + f.family + '";font-weight:' + weight +
            ';font-style:' + style + ';font-display:' + display +
            ';src:url("' + assetUrl(f.src, packIdOf(theme)) + '") format("woff2")}'
          )
        })
        .join('\n')
    }

    function buildCss(theme, frameReady) {
      const geometry = theme.geometry || {}
      const available = theme._available || {}
      const assetAvailable = available.assets || {}

      const chamfer = num(geometry.chamfer, 0)
      const plateColor = typeof geometry.plateColor === 'string' ? geometry.plateColor : '#202023'
      const plateOffset = num(geometry.composerPlateOffset, 0)
      const sidebarAlpha = num(geometry.sidebarAlpha, 1)
      const centerAlpha = num(geometry.centerAlpha, 1)
      const heroCenterAlpha = num(geometry.heroCenterAlpha, centerAlpha)
      const noiseOpacity = num(geometry.noiseOpacity, 0)
      const darkScrim = num(geometry.darkScrim, 0)

      const bg = assetAvailable['bg.main'] ? assetUrl(theme.assets && theme.assets['bg.main'], packIdOf(theme)) : null
      const noise = available.assets && available.assets.noise ? assetUrl(theme.assets && theme.assets.noise, packIdOf(theme)) : null
      const frame = assetAvailable['composer.frame']
        ? assetUrl(theme.assets && theme.assets['composer.frame'], packIdOf(theme))
        : null
      const grain = assetAvailable['composer.grain']
        ? assetUrl(theme.assets && theme.assets['composer.grain'], packIdOf(theme))
        : null
      const frameSlice = num(geometry.composerFrameSlice, 96)
      const frameWidth = num(geometry.composerFrameWidth, 26)
      const composerChrome = typeof geometry.composerChrome === 'string' ? geometry.composerChrome : 'css'
      const composerMaxWidth = num(geometry.composerMaxWidth, 720)
      const composerMinHeight = num(geometry.composerMinHeight, 178)
      const composerPaddingY = num(geometry.composerPaddingY, 24)
      const composerPaddingX = num(geometry.composerPaddingX, 28)
      const glass = glassState(theme)
      const glassAlpha = glass.alpha
      const glassBlur = glass.blur
      const composerGlassInset = num(geometry.composerGlassInset, 12)
      const chatGlassPadX = num(geometry.chatGlassPadX, 22)
      const chatGlassPadY = num(geometry.chatGlassPadY, 12)
      const artOpacity = num(geometry.artOpacity, 1)
      const bgFit = typeof geometry.bgFit === 'string' ? geometry.bgFit : 'cover'
      // native：按 CSS 像素给定尺寸显示，配合「出图尺寸 = 窗口设备像素」实现 1:1 不重采样
      const bgNative = typeof geometry.bgNative === 'string' && /^\d+x\d+$/.test(geometry.bgNative) ? geometry.bgNative : null
      const bgPosition = typeof geometry.bgPosition === 'string' ? geometry.bgPosition : 'center'
      const bgFill = typeof geometry.bgFill === 'string' ? geometry.bgFill : '#e9edf0'
      const bgPanorama = bgFit === 'panorama'
      const panoramaBlur = num(geometry.panoramaBlur, 28)
      const frameBg = assetAvailable['composer.frameBg']
        ? assetUrl(theme.assets && theme.assets['composer.frameBg'], packIdOf(theme))
        : null

      const out = []

      out.push(
        ':root{' +
          '--cf-pack-id:"' + packIdOf(theme) + '";' +
          '--cf-chamfer:' + chamfer + 'px;' +
          '--cf-plate-color:' + plateColor + ';' +
          '--cf-plate-offset:' + plateOffset + 'px;' +
          '--cf-sidebar-alpha:' + sidebarAlpha + ';' +
          '--cf-center-alpha:' + centerAlpha + ';' +
          '--cf-hero-center-alpha:' + heroCenterAlpha + ';' +
          '--cf-noise-opacity:' + noiseOpacity + ';' +
          '--cf-dark-scrim:' + darkScrim + ';' +
          '--cf-asset-bg-main:' + (bg ? 'url("' + bg + '")' : 'none') + ';' +
          '--cf-asset-wordmark:' +
            (assetAvailable.wordmark ? 'url("' + assetUrl(theme.assets.wordmark, packIdOf(theme)) + '")' : 'none') + ';' +
          '--cf-asset-portrait:' +
            (assetAvailable.portrait ? 'url("' + assetUrl(theme.assets.portrait, packIdOf(theme)) + '")' : 'none') + ';' +
          '}',
      )

      const faces = fontFaces(theme)
      if (faces) out.push(faces)

      /* --- background artwork -------------------------------------------------- */
      if (bg) {
        out.push(
          'html{background-color:transparent!important}',
          'body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;' +
            'background-color:' + bgFill + ';' +
            'background-image:url("' + bg + '");' +
            'background-repeat:no-repeat;' +
            'background-position:' + bgPosition + ';' +
            'background-size:' + (bgPanorama ? 'cover'
              : bgFit === 'native' && bgNative
              ? bgNative.replace('x', 'px ') + 'px'
              : bgFit === 'width' ? '100% auto' : bgFit === 'contain' ? 'contain' : 'cover') + ';' +
            'opacity:' + artOpacity + '}' +
            (bgPanorama
              ? ',body::before{filter:blur(' + panoramaBlur + 'px) saturate(0.92) brightness(1.02);' +
                'transform:scale(1.08);transform-origin:center}' +
                ',body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;' +
                'background-image:url("' + bg + '");background-repeat:no-repeat;background-position:center;' +
                'background-size:contain;opacity:' + artOpacity + '}'
              : ''),
          darkScrim > 0
            ? 'body[data-ds-dark-theme]::before{background-image:linear-gradient(rgba(8,10,12,' + darkScrim + '),' +
              'rgba(8,10,12,' + darkScrim + ')),url("' + bg + '")!important}'
            : '',
          'body[data-ds-dark-theme] [data-composer-card]{color-scheme:dark}',
          'body[data-ds-dark-theme] div:has(> [data-slot="main"]){background:linear-gradient(90deg,' +
            'rgba(8,10,12,' + Math.min(0.85, centerAlpha + 0.2).toFixed(2) + ') 0%,' +
            'rgba(8,10,12,' + Math.min(0.6, centerAlpha * 0.8).toFixed(2) + ') 46%,' +
            'rgba(8,10,12,0) 80%)!important}',
          'body[data-ds-dark-theme] [data-composer-card]{background-image:url("' + (frameBg || '') + '"),' +
            'linear-gradient(180deg,rgba(12,14,18,0.62),rgba(8,10,12,0.5))!important}',
          'html[data-platform="darwin"],html[data-platform="darwin"] body{background-color:transparent!important}',
          'html body,#root{background-color:transparent!important}',
          // 会话根容器（宿主默认 bg-base 不透明）→ 透明，让底图透出
          'div[data-phase]{background-color:transparent!important}',
          // 三列之外的 frame 本身也要透明，否则整块底图被 frame 底色盖住
          'div:has(> [data-rightbar-col]){background:transparent!important}',
        )
        if (darkScrim > 0) {
          out.push(
            'html[data-ds-dark-theme]{background-image:linear-gradient(rgba(8,10,12,' + darkScrim + '),' +
              'rgba(8,10,12,' + darkScrim + ')),url("' + bg + '")}',
          )
        }
      } else {
        out.push('html{background-color:var(--dsw-alias-bg-base)}')
      }

      /* --- panel translucency -------------------------------------------------- */
      out.push(
        'div:has(> [data-slot="sidebar"]){background:' +
          tint('--dsw-specific-sidebar-fill', sidebarAlpha) + '!important}',
        '[data-slot="sidebar"] > div > *{margin-left:34px!important}',
        '[data-slot="sidebar.brand.mark"], [data-slot="sidebar.brand.name"]{opacity:0!important}',
        '[data-slot="sidebar"] [class*="_logoRow"] > *{opacity:0!important}',
        '[data-slot="sidebar"] > div{padding-bottom:44px!important}',
        '[data-slot="sidebar"] > div > *:nth-child(3){margin-top:var(--cf-card-gap,236px)!important}',
        '[data-slot="sidebar"] > div{overflow-y:auto;scrollbar-width:none}',
        'div:has(> [data-slot="sidebar.workspaces"]){flex:1 1 auto!important;min-height:280px!important;' +
          'overflow-y:auto!important;overflow-x:hidden!important;display:flex!important;flex-direction:column}',
        // 会话态：不再整体加白/模糊，改成「左侧渐隐白纱」，右侧保持底图清晰
        'div:has(> [data-slot="main"]){background:' +
          // 底部轻微压暗，避免底图亮部与白纱叠加成一片死白
          'linear-gradient(180deg,rgba(28,28,31,0) 82%,rgba(28,28,31,0.10) 100%),' +
          'linear-gradient(90deg,' +
          'rgba(255,255,255,' + centerAlpha + ') 0%,' +
          'rgba(255,255,255,' + (centerAlpha * 0.5).toFixed(3) + ') 46%,' +
          'rgba(255,255,255,0) 80%)!important;' +
          'backdrop-filter:none!important}',
        'div:has(> [data-slot="main"]):has([data-content-phase="hero"]){background:' +
          tint('--dsw-alias-bg-base', heroCenterAlpha) + '!important;backdrop-filter:none!important}',
        'div:has(> [data-slot="rightbar"]){background:transparent!important}',
        '@media (max-width: 1180px){div:has(> [data-slot="main"]){background:linear-gradient(90deg,' +
          'rgba(255,255,255,0.72) 0%,rgba(255,255,255,0.45) 55%,rgba(255,255,255,0.12) 100%)!important}}',
      )

      /* --- composer seat：宿主默认用 bg-base 渐隐盖住卡片下方，改为半透明白纱 --- */
      out.push(
        '[data-composer-seat]{background-image:linear-gradient(180deg,' +
          'rgba(255,255,255,0) 0px,rgba(255,255,255,0.10) 40px)!important}',
      )

      /* --- 透明度滑块拇指（demo .tune-range 同款） --- */
      out.push(
        '.cf-tune-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:14px;' +
          'border:2px solid #f4f5f6;border-radius:1px;background:#333b42;box-shadow:0 0 0 1px #626a71;cursor:ew-resize}',
        '.cf-tune-range::-moz-range-thumb{width:10px;height:12px;border:2px solid #f4f5f6;border-radius:1px;' +
          'background:#333b42;box-shadow:0 0 0 1px #626a71;cursor:ew-resize}',
        '.cf-tune-range:focus-visible{outline:2px solid #4f7086;outline-offset:5px}',
      )

      /* --- composer 内层玻璃（demo：inset + 8 角切角 + blur） --- */
      out.push(
        '[data-composer-card]{position:relative!important}',
        ':root{--cf-composer-alpha:' + glassAlpha + ';--cf-composer-blur:' + glassBlur + 'px;' +
          '--cf-chat-alpha:' + glassAlpha + ';--cf-chat-blur:' + glassBlur + 'px;' +
          '--cf-glass-rgb:247,248,248;--cf-chat-rgb:248,249,250}',
        'body[data-ds-dark-theme]{--cf-glass-rgb:22,25,29;--cf-chat-rgb:20,23,27}',
        '[data-composer-card]::before{content:"";position:absolute;inset:' + composerGlassInset + 'px;z-index:0;' +
          'background:rgba(var(--cf-glass-rgb),var(--cf-composer-alpha));' +
          'backdrop-filter:blur(var(--cf-composer-blur));-webkit-backdrop-filter:blur(var(--cf-composer-blur));' +
          'clip-path:polygon(2.2% 0,97.8% 0,100% 12%,100% 88%,97.8% 100%,2.2% 100%,0 88%,0 12%);' +
          'pointer-events:none}',
        '[data-composer-card] > *{position:relative;z-index:1}',
      )

      /* --- 消息区玻璃：消息列一整片（对齐 demo 的 message-surface，无接缝） --- */
      out.push(
        '[data-conversation-region="chat"] [class*="_column"]{background:rgba(var(--cf-chat-rgb),var(--cf-chat-alpha))!important;' +
          'backdrop-filter:blur(var(--cf-chat-blur));-webkit-backdrop-filter:blur(var(--cf-chat-blur));' +
          'border-radius:3px!important;box-sizing:border-box!important;' +
          'padding:' + chatGlassPadY + 'px ' + chatGlassPadX + 'px!important}' +
        '[data-conversation-region="chat"] [class*="_column"] [class*="_flowItem"]{background:transparent!important}',
      )

      /* --- 侧栏列表细节：工作区/会话行、树线、时间、选中态 --- */
      const SB = 'div:has(> [data-slot="sidebar"])'
      out.push(
        SB + ' [class*="_sectionHeader"]{padding:2px 8px!important}',
        SB + ' [class*="_sectionLabel"]{font-size:14px!important;font-weight:700!important;letter-spacing:0.06em!important;color:var(--dsw-alias-label-primary)!important}',
        SB + ' [class*="_sectionHeader"] [class*="_sectionLabel"]::before{content:"";display:inline-block;' +
          'width:5px;height:11px;margin-right:7px;background:#2b2b2e;vertical-align:-1px;' +
          'clip-path:polygon(0 0,100% 50%,0 100%)}',
        SB + ' [class*="_searchButton"],' + SB + ' [class*="_sectionHeader"] button{color:var(--dsw-alias-label-secondary)!important}',
        // 工作区行
        SB + ' [class*="_projectRow"]{height:30px!important;padding:0 8px!important;border-radius:2px!important;' +
          'font-size:12.5px!important;font-weight:600!important;letter-spacing:0.02em!important;color:var(--dsw-alias-label-primary)!important}',
        SB + ' [class*="_projectRow"]:hover{background:rgba(28,28,31,0.05)!important}',
        SB + ' [class*="_projectRow"] [class*="_folder"] svg{width:15px!important;height:15px!important;color:var(--dsw-alias-label-primary)!important}',
        // 会话行：树线 + 菱形节点 + 时间
        SB + ' [class*="_sessionRow"]{height:29px!important;padding:0 6px 0 20px!important;position:relative!important;' +
          'border-radius:2px!important;font-size:12px!important}',
        SB + ' [class*="_sessionRow"]::before{content:"";position:absolute;left:9px;top:0;bottom:0;width:1px;' +
          'background:rgba(28,28,31,0.14)}',
        SB + ' [class*="_sessionRow"]::after{content:"";position:absolute;left:6.5px;top:50%;width:4px;height:4px;' +
          'border:1px solid rgba(28,28,31,0.38);background:#f7f8f7;transform:translateY(-50%) rotate(45deg)}',
        SB + ' [class*="_sessionRow"] [class*="_title"]{font-size:12px!important;letter-spacing:0.01em!important;color:var(--dsw-alias-label-primary)!important}',
        SB + ' [class*="_sessionRow"] [class*="_time"]{font-size:9px!important;letter-spacing:0.06em!important;' +
          'color:var(--dsw-alias-label-tertiary)!important;font-variant-numeric:tabular-nums}',
        SB + ' [class*="_sessionRow"] [class*="_rowActions"]{opacity:0;transition:opacity .12s}',
        SB + ' [class*="_sessionRow"]:hover [class*="_rowActions"]{opacity:1}',
        SB + ' [class*="_selected"]{background:rgba(28,28,31,0.09)!important}',
        SB + ' [class*="_selected"]::before{background:rgba(28,28,31,0.4)}',
        SB + ' [class*="_selected"]::after{background:#1c1c1f;border-color:#1c1c1f}',
        // 底部设置行
        SB + ' [class*="_settingsArea"]{padding:6px 4px!important;font-size:11.5px!important;letter-spacing:0.04em!important;' +
          'color:var(--dsw-alias-label-secondary)!important}',
      )

      /* --- composer card shape ------------------------------------------------- */
      if (composerChrome === 'frame' && frameBg) {
        // 容器方案：卡片本体透明化，外框图作为容器背景铺满（预缩放素材，1:1 贴图）
        out.push(
          '[data-composer-card]{' +
            'position:relative;isolation:isolate;' +
            'border:0!important;border-radius:0!important;box-sizing:border-box;' +
            'background-image:url("' + frameBg + '")!important;' +
            'background-color:transparent!important;' +
            'backdrop-filter:none!important;' +
            'background-size:100% 100%,auto!important;background-position:center,0 0!important;' +
            'background-repeat:no-repeat!important;background-origin:border-box!important;' +
            'background-clip:border-box!important;' +
            'box-shadow:none!important;clip-path:none!important;filter:none!important;' +
            'max-width:' + composerMaxWidth + 'px!important;' +
            'padding:' + composerPaddingY + 'px ' + composerPaddingX + 'px!important;' +
            'min-height:' + composerMinHeight + 'px!important;' +
            'justify-content:space-between' +
            '}',

          '[data-composer-card] [class*="_add"]{width:32px;height:32px;border:1px solid rgba(28,28,31,0.25)!important;' +
            'border-radius:2px!important;background:transparent!important;color:#1c1c1f!important}',
          '[data-composer-card] [class*="_primary"]{border-radius:2px!important;' +
            'background:#1c1c1f!important;color:#ffffff!important}',
          '[data-composer-card] [class*="_primary"] svg{color:#ffffff!important}',
          '[data-composer-card] [class*="_primary"]:disabled{background:#1c1c1f!important;opacity:0.4!important}',
          '[data-composer-card] [class*="_placeholder"]{color:#9a9aa0!important}',
          '[data-composer-card] [class*="_trailing"]{font-weight:500;letter-spacing:0.01em}',
          '[data-slot="conversation.input.permission"] button{color:#d92d20!important;' +
            'background:rgba(217,45,32,0.08)!important;border-radius:2px!important;padding:4px 8px!important}',
          '[data-slot="conversation.input.permission"] button svg{color:#d92d20!important}',
          '[data-slot="conversation.input.model"] button{font-weight:500}',
          '[data-composer-card] [class*="_placeholder"]{padding-left:2px}',
        )
      } else if (composerChrome === 'css') {
        const c = Math.max(Math.min(chamfer, 16), 10)
        // 纯 CSS 卡片：近实白卡面 + 切角 + 深色偏置垫板（drop-shadow 跟随切角形状；
        // 卡面接近不透明，避免透出宿主的测高副本）
        out.push(
          '[data-composer-card]{' +
            'position:relative;isolation:isolate;' +
            'border:1px solid rgba(28,28,31,0.55)!important;' +
            'border-radius:0!important;box-sizing:border-box;' +
            'background:rgba(255,255,255,0.98)!important;' +
            'box-shadow:none!important;' +
            'clip-path:polygon(' + c + 'px 0,100% 0,100% calc(100% - ' + c + 'px),' +
            'calc(100% - ' + c + 'px) 100%,0 100%,0 ' + c + 'px)' +
            '}',
          '[data-composer-card]{filter:drop-shadow(' + Math.max(plateOffset, 8) + 'px ' +
            Math.max(plateOffset, 8) + 'px 0 ' + plateColor + ')}',
          // 工具行：+ 方形描边、提交方形深色、placeholder 收色
          '[data-composer-card] [class*="_add"]{width:32px;height:32px;border:1px solid rgba(28,28,31,0.25)!important;' +
            'border-radius:2px!important;background:transparent!important;color:#1c1c1f!important}',
          '[data-composer-card] [class*="_primary"]{border-radius:2px!important;' +
            'background:#1c1c1f!important;color:#ffffff!important}',
          '[data-composer-card] [class*="_primary"] svg{color:#ffffff!important}',
          '[data-composer-card] [class*="_placeholder"]{color:#9a9aa0!important}',
          '[data-composer-card] [class*="_tools"]{gap:10px}',
          '[data-composer-card] [class*="_trailing"]{font-weight:500;letter-spacing:0.01em}',
          '[data-slot="conversation.input.permission"] button{color:#d92d20!important;' +
            'background:rgba(217,45,32,0.08)!important;border-radius:2px!important;padding:4px 8px!important}',
          '[data-slot="conversation.input.permission"] button svg{color:#d92d20!important}',
          '[data-slot="conversation.input.model"] button{font-weight:500}',
          '[data-composer-card] [class*="_placeholder"]{padding-left:2px}',
        )
      } else if (frame && frameReady) {
        // 素材外框：9-slice，内容叠在内部；垫板/切角由素材自身表达
        out.push(
          '[data-composer-card]{' +
            'position:relative;isolation:isolate;' +
            'border:' + frameWidth + 'px solid transparent!important;box-sizing:border-box;border-radius:0!important;' +
            'border-image-source:url("' + frame + '")!important;' +
            'border-image-slice:' + frameSlice + '!important;' +
            'border-image-width:' + frameWidth + 'px!important;' +
            'border-image-repeat:stretch!important;border-image-outset:0!important;' +
            'background-color:var(--dsw-specific-input-major);' +
            'box-shadow:none!important;clip-path:none!important;filter:none!important' +
            '}',
        )
        if (grain) {
          out.push(
            '[data-composer-card]::after{content:"";position:absolute;inset:0;pointer-events:none;' +
              'background-image:url("' + grain + '");background-size:256px 256px;' +
              'background-repeat:repeat;mix-blend-mode:multiply;opacity:1}',
          )
        }
      } else if (chamfer > 0) {
        const c = chamfer
        out.push(
          '[data-composer-card]{' +
            'border-radius:0!important;' +
            'clip-path:polygon(' + c + 'px 0,100% 0,100% calc(100% - ' + c + 'px),' +
            'calc(100% - ' + c + 'px) 100%,0 100%,0 ' + c + 'px);' +
            'border:1px solid var(--dsw-alias-border-l2);' +
            'backdrop-filter:blur(18px) saturate(1.05);' +
            'box-shadow:none!important' +
            '}',
        )
        if (plateOffset > 0) {
          out.push(
            '[data-composer-card]{filter:drop-shadow(' + plateOffset + 'px ' + plateOffset +
              'px 0 ' + plateColor + ')}',
          )
        }
      }

      /* --- 暗色下的输入卡控件配色（此前硬编码亮色导致不可见） --- */
      out.push(
        'body[data-ds-dark-theme] [data-composer-card] [class*="_add"]{color:#e8ecef!important;' +
          'border-color:rgba(255,255,255,0.30)!important;background:transparent!important}',
        'body[data-ds-dark-theme] [data-composer-card] [class*="_primary"]{background:#e8ecef!important;color:#14181d!important}',
        'body[data-ds-dark-theme] [data-composer-card] [class*="_primary"] svg{color:#14181d!important}',
        'body[data-ds-dark-theme] [data-composer-card] [class*="_placeholder"]{color:#8f979e!important}',
        'body[data-ds-dark-theme] [data-slot="conversation.input.permission"] button{color:#ff8f85!important;' +
          'background:rgba(255,90,80,0.16)!important}',
        'body[data-ds-dark-theme] [data-slot="conversation.input.permission"] button svg{color:#ff8f85!important}',
      )

      /* --- noise texture ------------------------------------------------------- */
      if (noise && noiseOpacity > 0) {
        out.push(
          'html::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:9999;' +
            'background-image:url("' + noise + '");background-size:128px 128px;' +
            'opacity:' + noiseOpacity + ';mix-blend-mode:multiply}',
        )
      }

      /* --- accessibility fallbacks -------------------------------------------- */
      out.push(
        '@media (prefers-reduced-transparency:reduce){' +
          'div:has(> [data-slot="sidebar"]){background:var(--dsw-specific-sidebar-fill)!important}' +
          'div:has(> [data-slot="main"]){background:var(--dsw-alias-bg-base)!important}' +
          '[data-composer-card]{backdrop-filter:none}}',
        '@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}',
      )

      return out.join('\n')
    }

    function applyPack(ctx, theme, disposers, frameReady) {
      const css = buildCss(theme, frameReady)
      const style = document.createElement('style')
      style.setAttribute('data-plugin-css', 'chonky-fish-themes')
      style.textContent = css
      document.head.appendChild(style)
      disposers.push(() => style.remove())

      if (theme && theme.tokens && ctx.theme) {
        disposers.push(ctx.theme.overrideTokens(packIdOf(theme), theme.tokens))
      }

      diag({
        stage: 'applied',
        frameReady: Boolean(frameReady),
        cssLen: css.length,
        styleApplied: true,
        tokens: theme && theme.tokens ? Object.keys(theme.tokens).length : 0,
        available: theme && theme._available
          ? {
              assets: Object.keys(theme._available.assets || {}).filter((k) => theme._available.assets[k]),
              fonts: Object.keys(theme._available.fonts || {}).filter((k) => theme._available.fonts[k]),
              customCss: theme._available.customCss,
            }
          : null,
        computed: collectCardInfo(),
        layout: diagHeavy() ? collectLayoutInfo() : [{ label: 'skipped', hint: 'cf-diag=1 开启' }],
      })
    }

    return {
      inject: ['theme', 'slots', 'locale'],
      apply(ctx) {
        try {
          window.addEventListener('error', (e) => {
            fetch(DIAG_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ kind: 'clientError', message: String(e.message), stack: String(e.error && e.error.stack || '').slice(0, 600) }) }).catch(() => {})
          })
          window.addEventListener('unhandledrejection', (e) => {
            fetch(DIAG_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ kind: 'clientRejection', message: String(e.reason && e.reason.message || e.reason) }) }).catch(() => {})
          })
        } catch (e) {}

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'chonky-fish-themes-decor',
          order: 20,
        }, DecorOverlay))

        ctx.effect(() => {
          const offs = []
          try {
            const snap = ctx.locale.getLocale()
            activeLocaleId = snap.active || activeLocaleId
            for (const def of snap.locales) {
              const dict = /^zh/i.test(def.id) ? LOCALE_DICT.zh : LOCALE_DICT.en
              offs.push(ctx.locale.register(LOCALE_NS, def.id, dict))
            }
            translateRef = ctx.locale.bind(LOCALE_NS)
            offs.push(ctx.locale.subscribe(() => {
              try { activeLocaleId = ctx.locale.getLocale().active || activeLocaleId } catch (e) {}
              for (const fn of Array.from(localeSubs)) {
                try { fn() } catch (e) {}
              }
            }))
          } catch (err) {
            console.error(LOG, 'locale registration failed:', err)
          }
          return () => {
            translateRef = null
            for (const off of offs) {
              try { off() } catch (e) {}
            }
          }
        }, 'chonky-fish-themes: locale')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'chonky-fish-theme-pack',
          order: 10.5,
        }, ThemePackRow))

        ctx.effect(() => {
          let disposed = false
          let themeCache = null
          let loadedId = null
          let frameReady = false
          let applied = []
          let probed = false

          diag({ stage: 'boot' })

          const disposeApplied = () => {
            for (const dispose of applied) {
              try { dispose() } catch (e) {}
            }
            applied = []
          }

          const sync = () => {
            if (disposed) return
            disposeApplied()
            const packId = resolvePackId()
            if (!packId || !themeCache || loadedId !== packId) {
              setTheme(null)
              return
            }
            setTheme(themeCache)
            try {
              applyPack(ctx, themeCache, applied, frameReady)
            } catch (err) {
              console.error(LOG, 'applyPack failed:', err)
              diag({ stage: 'apply-error', pack: packIdOf(themeCache), message: String((err && err.message) || err) })
            }
          }

          const probeFrame = (theme) => {
            if (probed) return
            probed = true
            const frameRel = theme.assets && theme.assets['composer.frame']
            const frameAvailable = Boolean(theme._available && theme._available.assets && theme._available.assets['composer.frame'])
            const frameUrl = frameAvailable && frameRel ? assetUrl(frameRel, packIdOf(theme)) : null
            if (!frameUrl) { sync(); return }
            try {
              const probe = new Image()
              probe.onload = () => {
                if (disposed) return
                frameReady = true
                diag({ stage: 'frame-loaded', pack: packIdOf(theme), w: probe.naturalWidth, h: probe.naturalHeight })
                sync()
              }
              probe.onerror = () => {
                if (disposed) return
                diag({ stage: 'frame-error', pack: packIdOf(theme) })
                sync()
              }
              probe.src = frameUrl
            } catch (err) {
              diag({ stage: 'probe-throw', message: String((err && err.message) || err) })
              sync()
            }
          }

          const loadTheme = (packId) => {
            disposeApplied()
            setTheme(null)
            if (!packId) { themeCache = null; loadedId = null; return }
            if (loadedId === packId && themeCache) { sync(); return }
            themeCache = null
            loadedId = null
            probed = false
            frameReady = false
            fetch(PACK_ROUTE(packId) + 'theme.json', { cache: 'no-store' })
              .then((res) => {
                if (!res.ok) throw new Error('theme.json HTTP ' + res.status)
                return res.json()
              })
              .then((theme) => {
                if (disposed || resolvePackId() !== packId) return
                themeCache = theme
                loadedId = packId
                diag({ stage: 'theme-loaded', pack: packId })
                probeFrame(theme)
              })
              .catch((err) => {
                console.error(LOG, 'theme load failed:', packId, err)
                diag({ stage: 'theme-fetch-error', pack: packId, message: String((err && err.message) || err) })
                sync()
              })
          }

          const onPacks = () => loadTheme(resolvePackId())
          packSubs.add(onPacks)

          fetch(INDEX_ROUTE, { cache: 'no-store' })
            .then((res) => {
              if (!res.ok) throw new Error('__index HTTP ' + res.status)
              return res.json()
            })
            .then((json) => {
              if (disposed) return
              const list = Array.isArray(json && json.packs) ? json.packs : []
              setPackCatalog(list)
              diag({ stage: 'packs', count: list.length, ids: list.map((p) => p.id) })
              loadTheme(resolvePackId())
            })
            .catch((err) => {
              console.error(LOG, 'pack index failed:', err)
              diag({ stage: 'index-error', message: String((err && err.message) || err) })
              setPackCatalog([])
              loadTheme(null)
            })

          return () => {
            disposed = true
            packSubs.delete(onPacks)
            disposeApplied()
            setTheme(null)
          }
        }, 'chonky-fish-themes: skin')
      },
    }
  },
})




/* bgfit reload 1793624075 */

/* red test 1793624115 */

/* contain fill 1793624137 */

/* revert cover 1793624703 */

/* css rail 1793624956 */
