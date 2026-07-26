#!/usr/bin/env node
// _inbox/ のうち未処理の画像/PDFエントリだけを一覧する(corrections.md・隠しファイル・
// Drive同期の一時ファイルは除外する)。契約4bに無い、夜間バッチ固有の一覧ヘルパー。
// 使い方: node analysis/helpers/list-inbox-items.mjs
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import path from 'node:path';
import { printJson } from './lib.mjs';

const IGNORED_NAMES = new Set(['corrections.md']);
const IGNORED_SUFFIXES = ['.tmp', '.crdownload', '.icloud', '.part'];

export function isProcessableInboxEntry(name) {
  if (IGNORED_NAMES.has(name)) return false;
  if (name.startsWith('.')) return false;
  if (IGNORED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
  return true;
}

export function filterInboxEntries(names) {
  return names.filter(isProcessableInboxEntry);
}

export async function run() {
  const { vaultRoot } = await import('./vault/index.mjs');
  const { readdir, stat } = await import('node:fs/promises');
  const root = vaultRoot();
  const inboxDir = path.join(root, '_inbox');
  const names = await readdir(inboxDir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const targets = filterInboxEntries(names);
  const items = [];
  for (const name of targets) {
    const info = await stat(path.join(inboxDir, name));
    if (!info.isFile()) continue;
    items.push({
      relPath: `_inbox/${name}`,
      name,
      ext: path.extname(name).toLowerCase(),
      mtime: info.mtime.toISOString(),
    });
  }
  items.sort((a, b) => a.mtime.localeCompare(b.mtime));
  return items;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run());
}
