# dsh-chonky-fish-themes

DeepSeek Harness（DSH）皮肤引擎 + `white-shark` 主题包。

**设计目标**：把视觉层做成「主题包 = 素材 + theme.json」，换主题只换 `packs/<id>/`，不改引擎代码。

## 结构

```
assets/<style>/          拖入的原始素材归档（不参与打包；见 assets/white-shark/README.md）
index.js                 Host 半：/skin 静态路由 + theme.json 注入 _available（文件是否就绪）
client.js                Client 半：读 theme.json → 覆盖 token + 注入样式 + 装饰层（overlay）
packs/<id>/theme.json    主题契约：tokens / geometry / copy / decor / capabilities
packs/<id>/*.webp,png    素材（底图、头像、外框、噪点、装甲导轨…）
tools/validate-pack.mjs  零依赖校验器：字段、枚举、范围、文件存在性
```

## 安装（当前 profile）

```bash
# 在 DSH 会话里用插件管理器安装（absolute path）
plugin_manager install_bundle /path/to/dsh-chonky-fish-themes
```

安装后 `cordis.patch.yml` 会插入 `@local/dsh-chonky-fish-themes`，Host 起 `/skin` 路由，Client 注册 `shell.overlay` 装饰层。

## 开发

```bash
node tools/validate-pack.mjs packs/white-shark --allow-missing-files   # 0 error / 素材缺失仅 warning
node --check client.js && node --check index.js
```

- 改 `client.js` 会触发客户端 HMR（重建 + 重载）；
- 只改 `theme.json` 不会自动重载，需要触碰 `client.js` 或重启应用；
- 诊断日志默认关闭，排障时以 `DSH_SKIN_DIAG=1` 启动宿主，客户端重量级采集用 `localStorage.setItem('cf-diag','1')`。

## 主题切换

安装后：**设置 → 通用设置 → 主题**，两个选项：

- **默认**：注销引擎注入的样式与 token 覆盖，回到 DSH 原生外观（无需重启）；
- **轻机甲风**：重新注入皮肤（配色、底图、玻璃、装甲导轨、资料卡）。

选择存在 `localStorage['cf-theme-mode']`（`mecha` 缺省 / `default`），刷新后保持。切换走的路径是 `ctx.locale` + `settings.general.item` 槽位，不修改宿主文件。

## 透明玻璃

输入卡与消息列共用一套「透明度」：`theme.geometry.composerGlassAlpha` 是默认值，用户在上缘拉手（⌃）里调过之后以 `localStorage['cf-glass-transparency']` 为准，`blur = round(12 × alpha)` 联动。

已清理的未实现声明：`bg.wide`、`wordmark`、`signature`、`decor.hud`、`icon`、`customCss`、`fonts`、`chrome.*`（引擎不读取）。`validate-pack` 现在 0 error / 0 warning。

## 主题包契约

`theme.json` 是主题包与本引擎之间的唯一数据接口：字段、取值范围与验收口径由本仓库的 `tools/validate-pack.mjs` 校验（运行 `node tools/validate-pack.mjs packs/<id>` 即得到当前契约的判定结果）。本仓库只放代码与素材。

## 素材状态

原始素材归档在 `assets/white-shark/`（风格目录 = 主题包 id），运行产物在 `packs/white-shark/`。

| 素材 | 状态 |
| --- | --- |
| `bg.webp` 底图 | ✅ 已接入 |
| `portrait.webp` 资料卡头像 | ✅ 已接入 |
| `decor/composer-frame*.png` 输入卡外框 | ✅ 已接入（暗色版待补） |
| `decor/sidebar-edge.png` 侧栏装甲导轨 | ⬜ 槽位已接，缺素材时用内置 SVG |
