import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  mapStudySessionRow,
  mapEventRow,
  mapPlanBlockRow,
  run,
} from '../helpers/migrate-supabase-to-vault.mjs';
import { parseStudySessions, readVaultFile, writeVaultFile } from '../helpers/vault/index.mjs';

function withVault(fn) {
  return async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-migrate-'));
    const previous = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    t.after(() => {
      rmSync(dir, { recursive: true, force: true });
      if (previous === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = previous;
    });
    await fn(dir);
  };
}

function makeFakeClient({ sessions = [], events = [], planBlocks = [], subjects = [], countOverride = {} } = {}) {
  const tables = { study_sessions: sessions, events, plan_blocks: planBlocks, subjects };
  return {
    selectAll: async (table) => tables[table] ?? [],
    count: async (table) => countOverride[table] ?? (tables[table] ?? []).length,
  };
}

const studyRow = (overrides = {}) => ({
  id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-01',
  record_type: 'material', common_test_year: null, common_test_section: null,
  understanding: 'understood', memo: '', unit_id: null, material_id: null, ...overrides,
});

test('mappers produce contract shapes without ids', () => {
  assert.deepEqual(mapStudySessionRow(studyRow({ memo: '長文2題' }), '英語R'), {
    subject: '英語R', minutes: 30, kind: 'material', understanding: 'understood', memo: '長文2題',
  });
  assert.deepEqual(mapStudySessionRow(studyRow({ record_type: 'common_test', common_test_year: 2025, common_test_section: '第3問' }), '数学IA'), {
    subject: '数学IA', minutes: 30, kind: 'common_test', year: 2025, section: '第3問', understanding: 'understood', memo: '',
  });
  assert.deepEqual(mapEventRow({ id: 'event-row', kind: 'mock_exam', title: '第2回模試', due_date: '2026-08-01', done: false }), {
    kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false,
  });
  assert.deepEqual(mapPlanBlockRow({ start_time: '09:00:00', end_time: '10:30:00', memo: null, status: 'planned', recurrence_rule: 'FREQ=WEEKLY' }, '英語R'), {
    start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '', hadRecurrence: true,
  });
});

test('run assigns unique ids, emits loss warnings, and marks migrated files', withVault(async () => {
  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [studyRow({ id: 'row-1', unit_id: 'unit-1' }), studyRow({ id: 'row-2', minutes: 40, material_id: 'mat-1' })],
    events: [{ id: 'event-row', kind: 'assignment', title: '英語課題', due_date: '2026-07-02', done: true }],
    planBlocks: [{ id: 'plan-row', plan_date: '2026-07-01', start_time: '09:00:00', end_time: '10:00:00', subject_id: 'subj-1', memo: '', status: 'planned', recurrence_rule: 'FREQ=WEEKLY' }],
  });
  const result = await run([], { createClient: () => client });
  assert.deepEqual(result.migrated, { studySessions: 2, events: 1, planBlocks: 1 });
  assert.match(result.warnings.join('\n'), /unit_id/);
  assert.match(result.warnings.join('\n'), /material_id/);
  assert.match(result.warnings.join('\n'), /recurrence_rule/);
  const record = await readVaultFile('records/2026-07-01.md');
  const ids = parseStudySessions(record.body).map((session) => session.id);
  assert.deepEqual(ids, ['s-1', 's-2']);
  assert.equal(record.frontmatter.source, 'migration');
  assert.equal((await readVaultFile('schedule.md')).frontmatter.source, 'migration');
  assert.equal((await readVaultFile('plans/2026-07-01.md')).frontmatter.source, 'migration');
}));

test('run --dry-run counts and warns without writing', withVault(async () => {
  const result = await run(['--dry-run'], { createClient: () => makeFakeClient({ subjects: [{ id: 'subj-1', name: '英語R' }], sessions: [studyRow({ unit_id: 'unit-1' })] }) });
  assert.equal(result.dryRun, true);
  assert.equal(result.migrated.studySessions, 1);
  assert.match(result.warnings.join('\n'), /unit_id/);
  await assert.rejects(() => readVaultFile('records/2026-07-01.md'));
}));

test('run is idempotent and skips source:migration files', withVault(async () => {
  const client = makeFakeClient({ subjects: [{ id: 'subj-1', name: '英語R' }], sessions: [studyRow()] });
  await run([], { createClient: () => client });
  const second = await run([], { createClient: () => client });
  assert.equal(second.migrated.studySessions, 0);
  assert.equal(second.skipped.studySessions, 1);
  assert.equal(parseStudySessions((await readVaultFile('records/2026-07-01.md')).body).length, 1);
}));

test('run requires --force for a dialogue-origin destination and --force appends safely', withVault(async () => {
  await writeVaultFile('records/2026-07-01.md', { type: 'study-record', date: '2026-07-01', source: 'dialogue', schema_version: 1 }, '## セッション\n- id=s-1 | subject=英語R | minutes=20 | kind=material | understanding=understood | memo=既存\n');
  const client = makeFakeClient({ subjects: [{ id: 'subj-1', name: '英語R' }], sessions: [studyRow()] });
  await assert.rejects(() => run([], { createClient: () => client }), /--force/);
  const result = await run(['--force'], { createClient: () => client });
  assert.equal(result.migrated.studySessions, 1);
  assert.deepEqual(parseStudySessions((await readVaultFile('records/2026-07-01.md')).body).map((s) => s.id), ['s-1', 's-2']);
}));

test('run --from-table resumes at the requested table', withVault(async () => {
  const result = await run(['--from-table', 'events'], { createClient: () => makeFakeClient({ events: [{ id: 'event-row', kind: 'other', title: '予定', due_date: '2026-07-02', done: false }] }) });
  assert.deepEqual(result.migrated, { studySessions: 0, events: 1, planBlocks: 0 });
  await assert.rejects(() => readVaultFile('records/2026-07-01.md'));
  await readVaultFile('schedule.md');
}));

test('run aborts if paged fetch count differs from the exact count', withVault(async () => {
  const client = makeFakeClient({ subjects: [{ id: 'subj-1', name: '英語R' }], sessions: [studyRow()], countOverride: { study_sessions: 2 } });
  await assert.rejects(() => run([], { createClient: () => client }), /取得件数.*一致|count mismatch/);
}));
