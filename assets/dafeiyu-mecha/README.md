# 素材源文件（风格：大肥鱼·白鲨轻甲 / `dafeiyu-mecha`）

本目录保存**拖入的原始素材**，便于追溯与重新加工；实际运行使用的是 `packs/dafeiyu-mecha/` 里的加工产物。

## 对应关系

| 源文件（本目录） | 产物（`packs/dafeiyu-mecha/`） | 加工方式 |
| --- | --- | --- |
| `bg-source.png`（原图 2.0 MB） | `bg.webp`（2880×1620 WebP 199 KB） | 等比缩放后转 WebP q85 |
| `portrait-source.png`（原图 1295×1214 2.0 MB） | `portrait.webp`（640×600 WebP 45 KB） | 缩放到卡片比例 1.067 后转 WebP q85 |
> 外框 / 磨砂两张素材与 `packs/dafeiyu-mecha/decor/` 下文件完全相同，已去重：只保留包内副本，避免仓库里存两份。

| — | `decor/composer-frame-bg.png` | 由 `composer-frame.png` 预缩放到卡片物理尺寸生成 |
| — | `noise.png` | 程序生成（128×128 噪点贴图） |
| `reference/mockup.png`（原图 2.0 MB） | — | 仅设计参考，引擎不读取 |

## 约定

- 一种风格一个目录，目录名与主题包 id 一致（当前 `dafeiyu-mecha`，中文名「轻机甲风」）；
- 源文件只做归档，不参与打包：`package.json` 的 `files` 只导出 `packs/`，部署不会带上本目录；
- 新增素材：先放本目录，再产出到 `packs/<style>/` 并更新 `theme.json`。

## 校验

`assets/dafeiyu-mecha/decor/*.png` 与 `packs/dafeiyu-mecha/decor/` 下同名文件字节一致，可用 `shasum -a 256` 复核。
