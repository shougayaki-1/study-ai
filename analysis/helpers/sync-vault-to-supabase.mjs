#!/usr/bin/env node
// vault/ 配下の .md ファイルを Supabase の vault_files (読み取り専用ミラー) へ
// 一方向同期する。夜間バッチの最終ステップから呼ばれる(analysis/nightly.md 手順7参照)。
// 変更があったファイルだけ upsert し、vault から消えたファイルはミラーからも削除する。
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv, printJson, restClient } from './lib.mjs';
import { vaultRoot } from './vault/root.mjs';

const PAGE_SIZE = 500;

export function planSync(localFiles, remoteFiles) {
  const toAdd = [];
  const toUpdate = [];
  const toDelete = [];
  for (const [filePath, content] of localFiles) {
    if (!remoteFiles.has(filePath)) toAdd.push({ path: filePath, content });
    else if (remoteFiles.get(filePath) !== content) toUpdate.push({ path: filePath, content });
  }
  for (const filePath of remoteFiles.keys()) {
    if (!localFiles.has(filePath)) toDelete.push(filePath);
  }
  return { toAdd, toUpdate, toDelete };
}

export async function collectMarkdownFiles(root) {
  const results = [];
  async function walk(dirFull, dirRel) {
    const entries = await readdir(dirFull, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const full = path.join(dirFull, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(full, 'utf8');
        results.push({ path: rel, content });
      }
    }
  }
  await walk(root, '');
  results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return results;
}

async function fetchAllVaultFileRows(client) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client.select('vault_files', `select=path,content&order=path.asc&limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function createVaultSyncClient() {
  const client = restClient();
  return {
    fetchAll: () => fetchAllVaultFileRows(client),
    upsert: (rows) => client.upsert('vault_files', rows, 'path'),
    remove: (filePath) => client.remove('vault_files', `path=eq.${encodeURIComponent(filePath)}`),
  };
}

function parseArgv(argv) {
  const options = { dryRun: false, force: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
  }
  return options;
}

export async function run(argv = [], { createClient = createVaultSyncClient, root } = {}) {
  const options = parseArgv(argv);
  // analysis/.env を process.env にマージしてから vaultRoot() を呼ぶ。順序が逆だと、
  // run-nightly.sh 経由(STUDY_AI_VAULT_DIR を export 済み)では動くのに、
  // シェルから直接実行したときだけ「STUDY_AI_VAULT_DIR is not set」で落ちる。
  // root を注入するテストは Supabase 認証情報も不要なので loadEnv しない。
  if (root === undefined) loadEnv();
  const vaultDir = root ?? vaultRoot();
  const client = createClient();
  const localEntries = await collectMarkdownFiles(vaultDir);
  const localFiles = new Map(localEntries.map((entry) => [entry.path, entry.content]));
  const remoteRows = await client.fetchAll();
  const remoteFiles = new Map(remoteRows.map((row) => [row.path, row.content]));

  if (localFiles.size === 0 && remoteFiles.size > 0 && !options.force) {
    throw new Error(
      `vault root looks wrong: no .md files found under ${vaultDir}, ` +
        `but the mirror holds ${remoteFiles.size} file(s). ` +
        'Refusing to sync because this would delete every mirrored file. ' +
        'Check STUDY_AI_VAULT_DIR, or pass --force if emptying the mirror is intentional.'
    );
  }

  const { toAdd, toUpdate, toDelete } = planSync(localFiles, remoteFiles);
  const summary = {
    dryRun: options.dryRun,
    added: toAdd.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
    addedPaths: toAdd.map((entry) => entry.path),
    updatedPaths: toUpdate.map((entry) => entry.path),
    deletedPaths: toDelete,
  };
  if (options.dryRun) return summary;

  const toUpsert = [...toAdd, ...toUpdate];
  if (toUpsert.length) {
    const now = new Date().toISOString();
    await client.upsert(toUpsert.map(({ path: p, content }) => ({ path: p, content, updated_at: now })));
  }
  await Promise.all(toDelete.map((p) => client.remove(p)));
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await run(process.argv.slice(2));
  printJson(result);
}
