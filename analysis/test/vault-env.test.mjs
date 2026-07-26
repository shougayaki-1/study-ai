import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { loadVaultEnv } from '../helpers/vault/env.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REAL_ENV_PATH = path.join(REPO_ROOT, 'analysis/.env');

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vault-env-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// process.env.STUDY_AI_VAULT_DIR を退避してテストを走らせる。
function withVaultDirEnv(initial, fn) {
  const original = process.env.STUDY_AI_VAULT_DIR;
  if (initial === undefined) delete process.env.STUDY_AI_VAULT_DIR;
  else process.env.STUDY_AI_VAULT_DIR = initial;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
}

function writeEnvFile(dir, contents) {
  const envPath = path.join(dir, '.env');
  writeFileSync(envPath, contents);
  return envPath;
}

test('loadVaultEnv keeps an already-exported STUDY_AI_VAULT_DIR', () => {
  withTempDir((dir) => {
    const envPath = writeEnvFile(dir, 'STUDY_AI_VAULT_DIR=/from/dotenv\n');
    withVaultDirEnv('/from/shell', () => {
      loadVaultEnv({ envPath });
      assert.equal(process.env.STUDY_AI_VAULT_DIR, '/from/shell');
    });
  });
});

test('loadVaultEnv reads STUDY_AI_VAULT_DIR from the env file', () => {
  withTempDir((dir) => {
    const envPath = writeEnvFile(dir, 'SUPABASE_URL=https://example.test\nSTUDY_AI_VAULT_DIR=/vault/from/file\n');
    withVaultDirEnv(undefined, () => {
      loadVaultEnv({ envPath });
      assert.equal(process.env.STUDY_AI_VAULT_DIR, '/vault/from/file');
    });
  });
});

test('loadVaultEnv does not import other keys (Supabase credentials stay untouched)', () => {
  withTempDir((dir) => {
    const envPath = writeEnvFile(dir, 'SUPABASE_SERVICE_ROLE_KEY=secret\nSTUDY_AI_VAULT_DIR=/vault\n');
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      withVaultDirEnv(undefined, () => {
        loadVaultEnv({ envPath });
        assert.equal(process.env.STUDY_AI_VAULT_DIR, '/vault');
        assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
      });
    } finally {
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});

test('loadVaultEnv strips surrounding quotes', () => {
  for (const [raw, expected] of [
    ['STUDY_AI_VAULT_DIR="/quoted/vault"\n', '/quoted/vault'],
    ["STUDY_AI_VAULT_DIR='/single/vault'\n", '/single/vault'],
  ]) {
    withTempDir((dir) => {
      const envPath = writeEnvFile(dir, raw);
      withVaultDirEnv(undefined, () => {
        loadVaultEnv({ envPath });
        assert.equal(process.env.STUDY_AI_VAULT_DIR, expected);
      });
    });
  }
});

test('loadVaultEnv skips comments and blank lines', () => {
  withTempDir((dir) => {
    const envPath = writeEnvFile(
      dir,
      '\n# STUDY_AI_VAULT_DIR=/commented/out\n\nSTUDY_AI_VAULT_DIR=/real/vault\n'
    );
    withVaultDirEnv(undefined, () => {
      loadVaultEnv({ envPath });
      assert.equal(process.env.STUDY_AI_VAULT_DIR, '/real/vault');
    });
  });
});

test('loadVaultEnv leaves STUDY_AI_VAULT_DIR unset when the env file is missing', () => {
  withTempDir((dir) => {
    withVaultDirEnv(undefined, () => {
      loadVaultEnv({ envPath: path.join(dir, 'does-not-exist.env') });
      assert.equal(process.env.STUDY_AI_VAULT_DIR, undefined);
    });
  });
});

test('loadVaultEnv leaves STUDY_AI_VAULT_DIR unset when the env file lacks the key', () => {
  withTempDir((dir) => {
    const envPath = writeEnvFile(dir, 'SUPABASE_URL=https://example.test\n');
    withVaultDirEnv(undefined, () => {
      loadVaultEnv({ envPath });
      assert.equal(process.env.STUDY_AI_VAULT_DIR, undefined);
    });
  });
});

// 回帰テスト: ヘルパーをシェルから直接実行したとき(= STUDY_AI_VAULT_DIR 未設定)に
// 「STUDY_AI_VAULT_DIR is not set」で即死しないこと。
// 実 analysis/.env の有無で期待値を分岐させる(CI には .env が無い)。
test('read-corrections.mjs resolves the vault root without an exported STUDY_AI_VAULT_DIR', () => {
  const helper = path.join(REPO_ROOT, 'analysis/helpers/read-corrections.mjs');
  const env = { ...process.env };
  delete env.STUDY_AI_VAULT_DIR;

  let stderr = '';
  let failed = false;
  try {
    execFileSync(process.execPath, [helper], { env, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    failed = true;
    stderr = String(error.stderr ?? '');
  }

  if (existsSync(REAL_ENV_PATH)) {
    // .env があるなら vault ルートは解決できているはず(vault 自体の状態には依存しない)。
    assert.ok(
      !stderr.includes('STUDY_AI_VAULT_DIR is not set'),
      `.env があるのに vault ルートを解決できていない: ${stderr}`
    );
  } else {
    // .env が無い環境(CI)では従来どおり明示的なエラーで落ちること。
    assert.ok(failed, '.env が無いのにエラーにならなかった');
    assert.match(stderr, /STUDY_AI_VAULT_DIR is not set/);
  }
});
