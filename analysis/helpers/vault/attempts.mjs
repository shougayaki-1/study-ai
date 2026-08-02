// 設問レベル学習記録 (attempts) の追記専用ストア。
// 同じ id の最後の行を現在値として扱い、訂正も既存行を消さずに追記する。

import { createHash } from 'node:crypto';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export const ATTEMPTS_REL_PATH = 'data/attempts.jsonl';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) {
    throw new Error('STUDY_AI_VAULT_DIR が未設定です。analysis/.env かシェル環境に設定してください。');
  }
  return dir;
}

function attemptsPath() {
  return path.join(vaultRoot(), ATTEMPTS_REL_PATH);
}

function shortHash(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function attemptId(artifactSha256, page, rowIndex) {
  return shortHash(`${artifactSha256}:${page}:${rowIndex}`);
}

export function correctionId(previousId, correctedAt) {
  return shortHash(`correction:${previousId}:${correctedAt}`);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortObject(nested)])
    );
  }
  return value;
}

function canonical(attempt) {
  const { ingested_at: _ignored, ...rest } = attempt;
  return JSON.stringify(sortObject(rest));
}

async function readLines() {
  let raw;
  try {
    raw = await readFile(attemptsPath(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const rows = [];
  for (const [index, line] of raw.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      throw new Error(`${ATTEMPTS_REL_PATH} の ${index + 1} 行目が JSON として壊れています`);
    }
  }
  return rows;
}

async function latestById() {
  const map = new Map();
  for (const row of await readLines()) map.set(row.id, row);
  return map;
}

export async function readAttempts(opts = {}) {
  const rows = Array.from((await latestById()).values());
  if (opts.includeInactive) return rows;
  return rows.filter((row) => row.record_status === 'active');
}

export async function appendAttempts(attempts) {
  if (!Array.isArray(attempts)) throw new Error('appendAttempts: 配列を渡してください');

  const current = await latestById();
  const toWrite = [];
  let unchanged = 0;

  for (const attempt of attempts) {
    if (!attempt || typeof attempt.id !== 'string' || !attempt.id) {
      throw new Error('appendAttempts: id を持たないレコードがあります');
    }
    if (typeof attempt.occurred_date !== 'string' || !attempt.occurred_date) {
      throw new Error(`appendAttempts: occurred_date が無いレコードです: ${attempt.id}`);
    }

    const existing = current.get(attempt.id);
    if (existing && canonical(existing) === canonical(attempt)) {
      unchanged += 1;
      continue;
    }
    toWrite.push(attempt);
    current.set(attempt.id, attempt);
  }

  if (toWrite.length > 0) {
    await mkdir(path.dirname(attemptsPath()), { recursive: true });
    await appendFile(attemptsPath(), `${toWrite.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  }

  return { added: toWrite.length, unchanged, total: current.size };
}

export async function supersedeAttempt(previousId, patch, correctedAt) {
  const map = await latestById();
  const previous = map.get(previousId);
  if (!previous) throw new Error(`supersedeAttempt: id が見つかりません: ${previousId}`);
  if (previous.record_status !== 'active') {
    throw new Error(`supersedeAttempt: 既に ${previous.record_status} です: ${previousId}`);
  }

  const retired = { ...previous, record_status: 'superseded' };
  const next = {
    ...previous,
    ...patch,
    id: correctionId(previousId, correctedAt),
    supersedes: previousId,
    record_status: 'active',
    confirmation_status: 'user_confirmed',
    extractor: { name: 'user-correction', version: '1.0.0', method: 'user' },
    ingested_at: correctedAt,
  };

  await appendAttempts([retired, next]);
  return next;
}
