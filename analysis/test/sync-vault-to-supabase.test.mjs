import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planSync, collectMarkdownFiles, run } from '../helpers/sync-vault-to-supabase.mjs';

test('planSync classifies added and deleted paths, skipping unchanged content', () => {
  const local = new Map([
    ['records/2026-07-25.md', 'new content'],
    ['records/2026-07-24.md', 'same content'],
  ]);
  const remote = new Map([
    ['records/2026-07-24.md', 'same content'],
    ['records/2026-07-20.md', 'stale content'],
  ]);
  const result = planSync(local, remote);
  assert.deepEqual(result.toAdd, [{ path: 'records/2026-07-25.md', content: 'new content' }]);
  assert.deepEqual(result.toUpdate, []);
  assert.deepEqual(result.toDelete, ['records/2026-07-20.md']);
});

test('planSync detects a content change as an update, not an add/delete', () => {
  const local = new Map([['schedule.md', 'v2']]);
  const remote = new Map([['schedule.md', 'v1']]);
  const result = planSync(local, remote);
  assert.deepEqual(result.toAdd, []);
  assert.deepEqual(result.toUpdate, [{ path: 'schedule.md', content: 'v2' }]);
  assert.deepEqual(result.toDelete, []);
});

test('collectMarkdownFiles walks subdirectories and skips hidden entries and non-markdown files', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'subjects', '英語R'), { recursive: true });
  await writeFile(path.join(dir, 'schedule.md'), 'schedule content', 'utf8');
  await writeFile(path.join(dir, 'subjects', '英語R', '弱点カルテ.md'), 'karte content', 'utf8');
  await writeFile(path.join(dir, '.hidden.md'), 'hidden', 'utf8');
  await writeFile(path.join(dir, 'notes.txt'), 'not markdown', 'utf8');

  const files = await collectMarkdownFiles(dir);

  assert.deepEqual(files, [
    { path: 'schedule.md', content: 'schedule content' },
    { path: 'subjects/英語R/弱点カルテ.md', content: 'karte content' },
  ]);
});

function makeFakeVaultFilesStore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { upserts: [], removes: [] };
  return {
    store,
    calls,
    client: {
      fetchAll: async () => Array.from(store, ([p, content]) => ({ path: p, content })),
      upsert: async (rows) => {
        calls.upserts.push(rows);
        for (const row of rows) store.set(row.path, row.content);
      },
      remove: async (p) => {
        calls.removes.push(p);
        store.delete(p);
      },
    },
  };
}

test('run --dry-run reports counts and paths without writing', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'v2', 'utf8');
  const fake = makeFakeVaultFilesStore({ 'schedule.md': 'v1', 'stale.md': 'x' });

  const result = await run(['--dry-run'], { createClient: () => fake.client, root: dir });

  assert.equal(result.dryRun, true);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.deleted, 1);
  assert.deepEqual(result.updatedPaths, ['schedule.md']);
  assert.deepEqual(result.deletedPaths, ['stale.md']);
  assert.equal(fake.calls.upserts.length, 0);
  assert.equal(fake.calls.removes.length, 0);
});

test('run upserts changed files and deletes files missing locally, then is idempotent', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'v2', 'utf8');
  const fake = makeFakeVaultFilesStore({ 'schedule.md': 'v1', 'stale.md': 'x' });

  const first = await run([], { createClient: () => fake.client, root: dir });
  assert.deepEqual(first, {
    dryRun: false, added: 0, updated: 1, deleted: 1,
    addedPaths: [], updatedPaths: ['schedule.md'], deletedPaths: ['stale.md'],
  });
  assert.equal(fake.store.get('schedule.md'), 'v2');
  assert.equal(fake.store.has('stale.md'), false);

  const second = await run([], { createClient: () => fake.client, root: dir });
  assert.deepEqual(second, {
    dryRun: false, added: 0, updated: 0, deleted: 0,
    addedPaths: [], updatedPaths: [], deletedPaths: [],
  });
});

test('run adds a brand-new file when the mirror is empty', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'fresh', 'utf8');
  const fake = makeFakeVaultFilesStore();

  const result = await run([], { createClient: () => fake.client, root: dir });

  assert.deepEqual(result.addedPaths, ['schedule.md']);
  assert.equal(fake.store.get('schedule.md'), 'fresh');
});

test('run refuses to wipe the mirror when the vault root has no markdown files', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fake = makeFakeVaultFilesStore();
  fake.store.set('records/2026-07-25.md', 'existing');
  fake.store.set('index.md', 'existing');

  await assert.rejects(
    () => run([], { createClient: () => fake.client, root: dir }),
    /Refusing to sync/
  );
  assert.equal(fake.store.size, 2, 'ミラーが1件も削除されていないこと');
});

test('run --force allows emptying the mirror on purpose', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fake = makeFakeVaultFilesStore();
  fake.store.set('records/2026-07-25.md', 'existing');

  const result = await run(['--force'], { createClient: () => fake.client, root: dir });

  assert.deepEqual(result.deletedPaths, ['records/2026-07-25.md']);
  assert.equal(fake.store.size, 0);
});
