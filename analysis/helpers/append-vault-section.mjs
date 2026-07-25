#!/usr/bin/env node
// 弱点カルテ.md / 誤答ログ.md に、既存本文を残したまま新しい日付見出しのセクションを
// 追記するための共通ユーティリティ(全置換にしない=差分更新)。夜間バッチ固有。
// 使い方: node analysis/helpers/append-vault-section.mjs <relPath> <heading> <contentFile|-> [frontmatterPatchJSON]
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { printJson } from './lib.mjs';

export function appendSection(body, heading, content) {
  const trimmed = body.replace(/\s+$/, '');
  const section = `## ${heading}\n\n${content.trim()}\n`;
  return trimmed ? `${trimmed}\n\n${section}` : section;
}

export function bumpFrontmatterUpdated(frontmatter, updatedAt, patch = {}) {
  return { ...frontmatter, ...patch, updated: updatedAt };
}

export async function run([relPath, heading, contentPathOrDash, frontmatterPatchArg]) {
  if (!relPath || !heading || !contentPathOrDash) {
    throw new Error('使い方: node helpers/append-vault-section.mjs <relPath> <heading> <contentFile|-> [frontmatterPatchJSON]');
  }
  const content = contentPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(contentPathOrDash, 'utf8');
  const patch = frontmatterPatchArg ? JSON.parse(frontmatterPatchArg) : {};
  const { readVaultFile, writeVaultFile } = await import('./vault/index.mjs');
  let existing = { frontmatter: {}, body: '' };
  try {
    existing = await readVaultFile(relPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const updatedAt = new Date().toISOString();
  const frontmatter = bumpFrontmatterUpdated(existing.frontmatter, updatedAt, patch);
  const body = appendSection(existing.body, heading, content);
  await writeVaultFile(relPath, frontmatter, body);
  return { path: relPath, updated: updatedAt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
