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
    const PACK_ID = 'white-shark'
    const ROUTE = '/skin/' + PACK_ID + '/'
    const DIAG_ROUTE = '/skin/__diag'
    const LOG = '[chonky-fish-themes]'

    function num(value, fallback) {
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    function assetUrl(rel) {
      return typeof rel === 'string' && rel.length > 0 ? ROUTE + rel : null
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
        const id = setInterval(bump, 900)
        return () => {
          clearInterval(id)
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
      if (decor.length === 0) return null
      const anchors = computeAnchors()
      const inHero = Boolean(document.querySelector('[data-content-phase="hero"]'))
      const children = []
      const isDark = document.body.hasAttribute('data-ds-dark-theme')
      const ink = isDark ? 'rgba(240,242,245,0.92)' : 'rgba(28,28,31,0.92)'
      const inkSoft = isDark ? 'rgba(240,242,245,0.55)' : 'rgba(28,28,31,0.55)'
      const inkFaint = isDark ? 'rgba(240,242,245,0.35)' : 'rgba(28,28,31,0.35)'
      const lineClr = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(28,28,31,0.45)'
      const lineSoft = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,28,31,0.18)'
      const cardFill = isDark ? 'rgba(14,16,20,0.82)' : 'rgba(247,248,247,0.92)'
      const copy = (theme && theme.copy) || {}
      const RAIL_W = 34
      const sidebarRect = rectOf('div:has(> [data-slot="sidebar"])')
      const brandRect = rectOf('[class*="_logoRow"]')
      const caps = Array.isArray(theme && theme.capabilities) ? theme.capabilities : []
      const portraitUrl = (theme && theme._available && theme._available.assets && theme._available.assets.portrait && theme.assets && theme.assets.portrait)
        ? ROUTE + theme.assets.portrait
        : null
      const portraitZoom = num(theme && theme.geometry && theme.geometry.portraitZoom, 170)
      const portraitFocusY = num(theme && theme.geometry && theme.geometry.portraitFocusY, 34)
      const profilePortraitHeight = num(theme && theme.geometry && theme.geometry.profilePortraitHeight, 84)

      if (sidebarRect && (copy.statusLabel || copy.brandMicroline)) {
        children.push(h('div', {
          key: 'brand-micro',
          style: {
            position: 'absolute',
            left: 'calc(' + (sidebarRect.right - 12) + 'px)',
            top: ((brandRect ? brandRect.top + 6 : sidebarRect.top + 14)) + 'px',
            transform: 'translateX(-100%)', textAlign: 'right',
            pointerEvents: 'none', userSelect: 'none',
          },
        },
          copy.statusLabel ? h('div', {
            style: { fontFamily: 'var(--ds-font-family-code)', fontSize: '10px', letterSpacing: '0.22em', color: 'var(--dsw-alias-label-primary)', opacity: 0.8, fontWeight: 600 },
          }, copy.statusLabel) : null,
          copy.brandMicroline ? h('div', {
            style: { marginTop: '4px', fontFamily: 'var(--ds-font-family-code)', fontSize: '7.5px', letterSpacing: '0.14em', color: 'var(--dsw-alias-label-tertiary)', opacity: 0.7 },
          }, copy.brandMicroline) : null,
        ))
      }

      // 侧栏左缘机械装甲导轨（SVG 路径，参考 dsh-mechanical-sidebar-demo）
      if (sidebarRect && caps.includes('profileCard')) {
        const rail = h('svg', {
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
      return h('div', {
        style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' },
        'aria-hidden': true,
      }, children)
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
            themeId: PACK_ID,
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
            ';src:url("' + ROUTE + f.src + '") format("woff2")}'
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

      const bg = assetAvailable['bg.main'] ? assetUrl(theme.assets && theme.assets['bg.main']) : null
      const noise = available.assets && available.assets.noise ? assetUrl(theme.assets && theme.assets.noise) : null
      const frame = assetAvailable['composer.frame']
        ? assetUrl(theme.assets && theme.assets['composer.frame'])
        : null
      const grain = assetAvailable['composer.grain']
        ? assetUrl(theme.assets && theme.assets['composer.grain'])
        : null
      const frameSlice = num(geometry.composerFrameSlice, 96)
      const frameWidth = num(geometry.composerFrameWidth, 26)
      const composerChrome = typeof geometry.composerChrome === 'string' ? geometry.composerChrome : 'css'
      const composerMaxWidth = num(geometry.composerMaxWidth, 720)
      const composerMinHeight = num(geometry.composerMinHeight, 178)
      const composerPaddingY = num(geometry.composerPaddingY, 24)
      const composerPaddingX = num(geometry.composerPaddingX, 28)
      const composerGlassAlpha = num(geometry.composerGlassAlpha, 0.62)
      const frameBg = assetAvailable['composer.frameBg']
        ? assetUrl(theme.assets && theme.assets['composer.frameBg'])
        : null

      const out = []

      out.push(
        ':root{' +
          '--cf-pack-id:"' + (theme.id || PACK_ID) + '";' +
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
            (assetAvailable.wordmark ? 'url("' + assetUrl(theme.assets.wordmark) + '")' : 'none') + ';' +
          '--cf-asset-portrait:' +
            (assetAvailable.portrait ? 'url("' + assetUrl(theme.assets.portrait) + '")' : 'none') + ';' +
          '}',
      )

      const faces = fontFaces(theme)
      if (faces) out.push(faces)

      /* --- background artwork -------------------------------------------------- */
      if (bg) {
        out.push(
          'html{background-color:transparent!important}',
          'body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;' +
            'background:url("' + bg + '") center/cover no-repeat!important}',
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

      /* --- 侧栏左缘机械缺口装饰（SVG data URI，无需素材） --- */
      const edgeAsset = (theme._available && theme._available.assets && theme._available.assets['decor.sidebarEdge'] && theme.assets && theme.assets['decor.sidebarEdge'])
        ? 'url("' + ROUTE + theme.assets['decor.sidebarEdge'] + '")'
        : null
      const edgeSvgRaw = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="1600" viewBox="0 0 9 1600">' +
        '<g fill="#202023">' +
        '<path d="M0 0h9v3L0 16z"/>' +
        '<rect x="0" y="238" width="4" height="2"/><rect x="0" y="242" width="2" height="10"/>' +
        '<path d="M0 520h5l3 8v10l-3 8H0z"/>' +
        '<rect x="0" y="756" width="2" height="14"/><rect x="0" y="774" width="4" height="2"/>' +
        '<path d="M0 1178h6l3 10v12l-3 10H0z"/>' +
        '<rect x="0" y="1478" width="3" height="2"/><rect x="0" y="1484" width="2" height="12"/>' +
        '<path d="M0 1582h9v3L0 1598z"/>' +
        '</g>' +
        '<g fill="none" stroke="#6b6b70" stroke-width="0.5" opacity="0.45">' +
        '<path d="M6.5 60v120M6.5 300v90M6.5 560v120M6.5 820v120M6.5 1060v90M6.5 1240v100M6.5 1400v60"/>' +
        '</g></svg>'
      const edgeSvg = encodeURIComponent(edgeSvgRaw)
      out.push(
        'div:has(> [data-slot="sidebar"]){position:relative!important}',
        'div:has(> [data-slot="sidebar"])::before{content:"";position:absolute;left:0;top:0;bottom:0;width:9px;' +
          'z-index:3;pointer-events:none;' +
          'background:' + (edgeAsset || ('url("data:image/svg+xml;charset=utf-8,' + edgeSvg + '")')) + ' left top/9px 100% no-repeat}',
      )

      /* --- composer seat：宿主默认用 bg-base 渐隐盖住卡片下方，改为半透明白纱 --- */
      out.push(
        '[data-composer-seat]{background-image:linear-gradient(180deg,' +
          'rgba(255,255,255,0) 0px,rgba(255,255,255,0.10) 40px)!important}',
      )

      /* --- composer card shape ------------------------------------------------- */
      if (composerChrome === 'frame' && frameBg) {
        // 容器方案：卡片本体透明化，外框图作为容器背景铺满（预缩放素材，1:1 贴图）
        out.push(
          '[data-composer-card]{' +
            'position:relative;isolation:isolate;' +
            'border:0!important;border-radius:0!important;box-sizing:border-box;' +
            'background-image:url("' + frameBg + '"),' +
              'linear-gradient(180deg,rgba(255,255,255,' + composerGlassAlpha + '),' +
              'rgba(243,245,247,' + (composerGlassAlpha * 0.84).toFixed(3) + '))!important;' +
            'background-color:transparent!important;' +
            'backdrop-filter:blur(12px) saturate(1.04);' +
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
        disposers.push(ctx.theme.overrideTokens(PACK_ID, theme.tokens))
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
        layout: collectLayoutInfo(),
      })
    }

    return {
      inject: ['theme', 'slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'chonky-fish-themes-decor',
          order: 20,
        }, DecorOverlay))

        ctx.effect(() => {
          let disposed = false
          const disposers = []

          diag({ stage: 'boot' })
          const bgProbe = new Image()
          bgProbe.onload = () => diag({ stage: 'bg-loaded', w: bgProbe.naturalWidth, h: bgProbe.naturalHeight })
          bgProbe.onerror = (e) => diag({ stage: 'bg-error', msg: 'image failed' })
          bgProbe.src = ROUTE + 'bg.webp'

          fetch(ROUTE + 'theme.json', { cache: 'no-store' })
            .then((res) => {
              if (!res.ok) throw new Error('theme.json HTTP ' + res.status)
              return res.json()
            })
            .then((theme) => {
              if (disposed) return
              setTheme(theme)
              const frameRel = theme.assets && theme.assets['composer.frame']
              const frameAvailable = Boolean(theme._available && theme._available.assets && theme._available.assets['composer.frame'])
              const frameUrl = frameAvailable && frameRel ? assetUrl(frameRel) : null
              if (!frameUrl) {
                applyPack(ctx, theme, disposers, false)
                return
              }
              // 图片探测：加载成功才启用 9-slice，失败则回退纯 CSS 造型
              try {
                const probe = new Image()
                probe.onload = () => {
                  if (disposed) return
                  diag({ stage: 'frame-loaded', w: probe.naturalWidth, h: probe.naturalHeight })
                  applyPack(ctx, theme, disposers, true)
                }
                probe.onerror = () => {
                  if (disposed) return
                  diag({ stage: 'frame-error' })
                  applyPack(ctx, theme, disposers, false)
                }
                probe.src = frameUrl
              } catch (err) {
                diag({ stage: 'probe-throw', message: String((err && err.message) || err) })
                applyPack(ctx, theme, disposers, false)
              }
            })
            .catch((err) => {
              console.error(LOG, 'theme load failed:', err)
              diag({ stage: 'theme-fetch-error', message: String((err && err.message) || err) })
            })

          return () => {
            disposed = true
            for (const dispose of disposers) {
              try {
                dispose()
              } catch {
                /* already disposed */
              }
            }
          }
        }, 'chonky-fish-themes: skin')
      },
    }
  },
})

/* hmr probe 1793600760 */

/* hmr 1793600859 */

/* sync 1793600938 */

/* sync 1793601301 */

/* sync 1793603402 */

/* sync 1793603788 */

/* sync 1793603861 */

/* a-0.62 1793603934 */

/* a-0.42 1793603944 */

/* a-0.30 1793603954 */

/* a-0.22 1793603964 */

/* a-0.10 1793603975 */

/* v2 1793605499 */
