#!/usr/bin/env node
// attempts.jsonl から vault/data/derived/skills-<科目>.json を再生成する。

import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { readAttempts } from './vault/attempts.mjs';
import { buildSkills } from './vault/skills.mjs';

export const DERIVED_REL_DIR = 'data/derived';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return dir;
}

export function safeName(subject) {
  return subject.replace(/[/\\:*?"<>|]/g, '_');
}

function nowJst() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}+09:00`;
}

async function main() {
  const generatedAt = nowJst();
  const attempts = await readAttempts();
  const files = buildSkills(attempts, generatedAt);
  const dir = path.join(vaultRoot(), DERIVED_REL_DIR);
  await mkdir(dir, { recursive: true });

  const written = [];
  for (const [subject, content] of Object.entries(files)) {
    const name = `skills-${safeName(subject)}.json`;
    await writeFile(path.join(dir, name), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
    written.push(name);
  }

  const existing = await readdir(dir).catch(() => []);
  const stale = existing.filter((name) => name.startsWith('skills-') && name.endsWith('.json') && !written.includes(name));
  for (const name of stale) await rm(path.join(dir, name));
  console.log(JSON.stringify({ generatedAt, attempts: attempts.length, written, removed: stale }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
