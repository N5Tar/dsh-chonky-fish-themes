# dsh-chonky-fish-themes

DeepSeek Harness（DSH）皮肤引擎 + `dafeiyu-mecha` 主题包。

**设计目标**：把视觉层做成「主题包 = 素材 + theme.json」，换主题只换 `packs/<id>/`，不改引擎代码。

## 结构

```
assets/<style>/          拖入的原始素材归档（不参与打包；见 assets/dafeiyu-mecha/README.md）
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
node tools/validate-pack.mjs packs/dafeiyu-mecha --allow-missing-files   # 0 error / 素材缺失仅 warning
node --check client.js && node --check index.js
```

- 改 `client.js` 会触发客户端 HMR（重建 + 重载）；
- 只改 `theme.json` 不会自动重载，需要触碰 `client.js` 或重启应用；
- 诊断日志默认关闭，排障时以 `DSH_SKIN_DIAG=1` 启动宿主，客户端重量级采集用 `localStorage.setItem('cf-diag','1')`。

## 主题切换（多主题）

安装后：**设置 → 通用设置 → 主题**，选项由 `packs/index.json` 动态生成：

- **默认**：注销引擎注入的样式与 token 覆盖，回到 DSH 原生外观（无需重启）；
- **每个已安装主题**：读取该包自己的 `theme.json`（tokens / geometry / copy / decor / assets）重新渲染。

当前内置两个主题包：

| id | 名称 | 说明 |
| --- | --- | --- |
| `dafeiyu-mecha` | 大肥鱼·白鲨轻甲 | 基础主题 |
| `dafeiyu-armor` | 大肥鱼·白鲨装甲 | 机甲化变体（白色外骨骼装甲、蓝色微光） |

选择存在 `localStorage['cf-theme-pack']`（`default` 或包 id；旧的 `cf-theme-mode` 会自动迁移），刷新后保持。

### 新增一个主题

1. 新建 `packs/<id>/`：`theme.json` + 素材（可直接复制现有主题包改 `id` / `meta.name` / 素材）；
2. 跑 `npm run index` 重建 `packs/index.json`；
3. 重载客户端（改 `client.js` 触发 HMR，或刷新页面）；
4. `npm run validate:all` 确认每个包 0 error / 0 warning。

主题之间完全独立：名字、`theme.json`、素材互不共享；引擎不写死任何包 id。

## 透明玻璃

输入卡与消息列共用一套「透明度」：`theme.geometry.composerGlassAlpha` 是默认值，用户在上缘拉手（⌃）里调过之后以 `localStorage['cf-glass-transparency']` 为准，`blur = round(12 × alpha)` 联动。

已清理的未实现声明：`bg.wide`、`wordmark`、`signature`、`decor.hud`、`icon`、`customCss`、`fonts`、`chrome.*`（引擎不读取）。`validate-pack` 现在 0 error / 0 warning。

## 主题包契约

`theme.json` 是主题包与本引擎之间的唯一数据接口：字段、取值范围与验收口径由本仓库的 `tools/validate-pack.mjs` 校验（运行 `node tools/validate-pack.mjs packs/<id>` 即得到当前契约的判定结果）。本仓库只放代码与素材。

## 素材状态

原始素材归档在 `assets/dafeiyu-mecha/`（风格目录 = 主题包 id），运行产物在 `packs/dafeiyu-mecha/`。

| 素材 | 状态 |
| --- | --- |
| `bg.webp` 底图 | ✅ 已接入 |
| `portrait.webp` 资料卡头像 | ✅ 已接入 |
| `decor/composer-frame*.png` 输入卡外框 | ✅ 已接入（暗色版待补） |
| `decor/sidebar-edge.png` 侧栏装甲导轨 | ⬜ 槽位已接，缺素材时用内置 SVG |
