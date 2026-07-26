#!/usr/bin/env node
// runs/YYYY-MM-DD.md にラン開始を記録する。夜間バッチ固有(内部で契約4bのwriteVaultFileを使う)。
// 使い方: node analysis/helpers/start-run.mjs <dateStr(YYYY-MM-DD)> [--force]
//
// **二重起動ロック**: 同じvaultに対して夜間バッチが2つ同時に走ると、同じ `誤答ログ.md` /
// `弱点カルテ.md` に二重追記される事故が起きる(実際に発生済み)。runs/$TODAY.md は日付が
// 違えば衝突すらしないので、ロックは日付に依存しない固定パス `runs/.lock` に置く。
//
// - ロックの取得は fs の `wx` フラグ(既に在れば EEXIST で失敗する排他作成)で行う。
//   writeVaultFile は temp+rename で「既存を上書きする」ため排他にならず、
//   「読んでから書く」方式も読みと書きの間に競合窓が残るので、ここでは採用しない。
// - ロックが取れなかった場合、start-run は **vaultへの書き込みを一切行わず** に throw する。
//   (runs/$TODAY.md も作らない = ロック取得が最初の副作用)
// - `--force` を付けると、有効なロックがあっても奪って続行する(手動復旧用の脱出口。
//   バッチが本当に走っていないと確信できるときだけ使う)。
import { fileURLToPath } from 'node:url';
import { open, readFile, unlink, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { hostname } from 'node:os';
import { printJson } from './lib.mjs';

export const RUN_LOCK_REL_PATH = 'runs/.lock';

// stale判定のしきい値。実測では成功ランの所要時間は約9分半(2026-07-26のラン)。
// 画像枚数が増えた日や再試行で数倍に伸びる可能性を見込んでも1時間には届かないため、
// 実測の約12倍にあたる2時間を「もう生きていない」と見なす閾値とする。
// これより短いと長引いたランを誤って奪ってしまい、長すぎるとクラッシュ後の復旧が遅れる。
export const STALE_LOCK_MS = 2 * 60 * 60 * 1000;

function lockFullPath(vaultDir) {
  return path.join(vaultDir, RUN_LOCK_REL_PATH);
}

export function isStaleLock(lockInfo, nowMs, staleMs = STALE_LOCK_MS) {
  // 中身が壊れている/started_atが読めないロックは、判断材料が無いので stale 扱いにする
  // (残り続けて以後の実行を永久に止めるより、警告のうえ奪えた方が安全)。
  if (!lockInfo || typeof lockInfo.started_at !== 'string') return true;
  const started = Date.parse(lockInfo.started_at);
  if (Number.isNaN(started)) return true;
  return nowMs - started > staleMs;
}

export function formatLockHeldError(lockInfo, nowMs) {
  const ageMin = lockInfo && lockInfo.started_at && !Number.isNaN(Date.parse(lockInfo.started_at))
    ? Math.round((nowMs - Date.parse(lockInfo.started_at)) / 60000)
    : null;
  const parts = [
    `別の夜間バッチが実行中です(${RUN_LOCK_REL_PATH} が存在します)。何も書き込まずに終了します。`,
    `  pid=${lockInfo?.pid ?? '不明'}`,
    `  host=${lockInfo?.host ?? '不明'}`,
    `  date=${lockInfo?.date ?? '不明'}`,
    `  started_at=${lockInfo?.started_at ?? '不明'}${ageMin === null ? '' : ` (${ageMin}分前)`}`,
    `  ${Math.round(STALE_LOCK_MS / 60000)}分を超えた古いロックは自動的に奪います。`,
    `  それより前に手動で解除したい場合: node analysis/helpers/finish-run.mjs --release-lock`,
    `  もしくは start-run.mjs に --force を付けて再実行してください。`,
  ];
  return parts.join('\n');
}

export async function readRunLock(vaultDir) {
  try {
    const raw = await readFile(lockFullPath(vaultDir), 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      return {}; // 壊れたロック → isStaleLock が stale 扱いにする
    }
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeLockExclusive(vaultDir, payload) {
  const full = lockFullPath(vaultDir);
  await mkdir(path.dirname(full), { recursive: true });
  // 'wx' = 既に在れば EEXIST。作成と存在チェックがカーネル側で不可分なので競合窓が無い。
  const handle = await open(full, 'wx');
  try {
    await handle.writeFile(JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } finally {
    await handle.close();
  }
}

/**
 * runs/.lock を排他取得する。取得できなければ throw(vaultへの書き込みは一切行わない)。
 * @returns {Promise<{ lock: object, takenOver: null | object }>}
 */
export async function acquireRunLock(vaultDir, { dateStr, now = new Date(), force = false } = {}) {
  const payload = {
    pid: process.pid,
    host: hostname(),
    date: dateStr,
    started_at: now.toISOString(),
  };
  let takenOver = null;

  try {
    await writeLockExclusive(vaultDir, payload);
    return { lock: payload, takenOver };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  const existing = await readRunLock(vaultDir);
  if (existing === null) {
    // 直前に解放された。もう一度だけ取りに行く。
    await writeLockExclusive(vaultDir, payload);
    return { lock: payload, takenOver };
  }

  const stale = isStaleLock(existing, now.getTime());
  if (!force && !stale) {
    throw new Error(formatLockHeldError(existing, now.getTime()));
  }

  console.warn(
    force
      ? `[start-run] --force により既存のロックを奪います: ${JSON.stringify(existing)}`
      : `[start-run] ${Math.round(STALE_LOCK_MS / 60000)}分を超えた古いロックを奪います(クラッシュ跡と判断): ${JSON.stringify(existing)}`,
  );
  takenOver = existing;
  await unlink(lockFullPath(vaultDir)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  try {
    await writeLockExclusive(vaultDir, payload);
  } catch (error) {
    if (error.code === 'EEXIST') {
      // 奪おうとした隙に別プロセスが取得した。こちらは何も書かずに諦める。
      throw new Error(formatLockHeldError(await readRunLock(vaultDir), now.getTime()));
    }
    throw error;
  }
  return { lock: payload, takenOver };
}

/** runs/.lock を解放する。存在しなくてもエラーにしない。 */
export async function releaseRunLock(vaultDir) {
  try {
    await unlink(lockFullPath(vaultDir));
    return { released: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { released: false };
    throw error;
  }
}

/** ロックファイルの mtime。テストと診断用。 */
export async function runLockMtimeMs(vaultDir) {
  const info = await stat(lockFullPath(vaultDir));
  return info.mtimeMs;
}

export function buildRunStartFrontmatter(dateStr, startedAt) {
  return {
    type: 'run-log',
    date: dateStr,
    started_at: startedAt,
    source: 'nightly-batch',
    schema_version: 1,
    updated: startedAt,
  };
}

export function buildRunStartBody(dateStr) {
  return `# ラン記録 ${dateStr}\n\n## 実行中\n\n- 開始しました。完了時にこのセクションを完了報告へ置き換えます。\n`;
}

export async function run(argv) {
  const args = argv.filter((a) => a !== '--force');
  const force = argv.includes('--force');
  const [dateStr] = args;
  if (!dateStr) throw new Error('使い方: node helpers/start-run.mjs <dateStr> [--force]');
  const startedAt = new Date();
  const { vaultRoot, writeVaultFile } = await import('./vault/index.mjs');
  const vaultDir = vaultRoot();

  // ロック取得が最初の副作用。ここで throw した場合、vaultには何も書かれていない。
  const { lock, takenOver } = await acquireRunLock(vaultDir, { dateStr, now: startedAt, force });

  const startedAtIso = lock.started_at;
  const frontmatter = buildRunStartFrontmatter(dateStr, startedAtIso);
  await writeVaultFile(`runs/${dateStr}.md`, frontmatter, buildRunStartBody(dateStr));
  return {
    path: `runs/${dateStr}.md`,
    started_at: startedAtIso,
    lock: RUN_LOCK_REL_PATH,
    took_over_stale_lock: takenOver,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { loadVaultEnv } = await import('./vault/env.mjs');
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
