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
  factory() {
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
          'html[data-platform="darwin"],html[data-platform="darwin"] body{background-color:transparent!important}',
          'html{background-image:url("' + bg + '");background-position:center;background-size:cover;' +
            'background-repeat:no-repeat;background-attachment:fixed;background-color:transparent!important}',
          'html body{background-color:transparent!important}',
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
        'div:has(> [data-slot="main"]){background:' +
          tint('--dsw-alias-bg-base', centerAlpha) + '!important}',
        'div:has(> [data-slot="main"]):has([data-content-phase="hero"]){background:' +
          tint('--dsw-alias-bg-base', heroCenterAlpha) + '!important}',
        'div:has(> [data-slot="rightbar"]){background:transparent!important}',
      )

      /* --- composer card shape ------------------------------------------------- */
      if (composerChrome === 'frame' && frameBg) {
        // 容器方案：卡片本体透明化，外框图作为容器背景铺满（预缩放素材，1:1 贴图）
        out.push(
          '[data-composer-card]{' +
            'position:relative;isolation:isolate;' +
            'border:0!important;border-radius:0!important;box-sizing:border-box;' +
            'background:rgba(255,255,255,0.97)!important;' +
            'box-shadow:none!important;clip-path:none!important;filter:none!important;' +
            'padding:44px 30px!important' +
            '}',
          '[data-composer-card]::before{content:"";position:absolute;inset:0;z-index:-1;' +
            'background:url("' + frameBg + '") center/100% 100% no-repeat;pointer-events:none}',
          '[data-composer-card] [class*="_add"]{width:32px;height:32px;border:1px solid rgba(28,28,31,0.25)!important;' +
            'border-radius:2px!important;background:transparent!important;color:#1c1c1f!important}',
          '[data-composer-card] [class*="_primary"]{border-radius:2px!important;' +
            'background:#1c1c1f!important;color:#ffffff!important}',
          '[data-composer-card] [class*="_primary"] svg{color:#ffffff!important}',
          '[data-composer-card] [class*="_placeholder"]{color:#9a9aa0!important}',
          '[data-composer-card] [class*="_trailing"]{font-weight:500;letter-spacing:0.01em}',
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
      })
    }

    return {
      inject: ['theme'],
      apply(ctx) {
        ctx.effect(() => {
          let disposed = false
          const disposers = []

          diag({ stage: 'boot' })

          fetch(ROUTE + 'theme.json', { cache: 'no-store' })
            .then((res) => {
              if (!res.ok) throw new Error('theme.json HTTP ' + res.status)
              return res.json()
            })
            .then((theme) => {
              if (disposed) return
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
