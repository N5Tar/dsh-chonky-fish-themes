#!/usr/bin/env node
/**
 * build-index — 扫描 packs/<id>/theme.json，生成 packs/index.json（客户端主题列表）。
 *
 * 为什么用静态索引：客户端只需要「有哪些主题」，静态文件由旧版宿主也能直接提供，
 * 新增主题时跑一次本脚本即可，不必改宿主代码或重启应用。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(HERE, '..', 'packs')
const OUT = join(PACKS_DIR, 'index.json')

const packs = []
for (const entry of readdirSync(PACKS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifestPath = join(PACKS_DIR, entry.name, 'theme.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    continue
  }
  const meta = manifest.meta || {}
  packs.push({
    id: typeof manifest.id === 'string' ? manifest.id : entry.name,
    name: meta.name || null,
    description: meta.description || null,
    version: meta.version || manifest.packVersion || null,
    colorScheme: meta.colorScheme || null,
  })
}

packs.sort((a, b) => String(a.id).localeCompare(String(b.id)))
writeFileSync(OUT, JSON.stringify({ packs }, null, 2) + '\n')
console.log(`packs/index.json: ${packs.length} pack(s) — ${packs.map((p) => p.id).join(', ')}`)
