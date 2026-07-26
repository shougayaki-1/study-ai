#!/usr/bin/env node
// One-off, manual Supabase-to-vault migration. Never add this to nightly jobs.
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { loadEnv, printJson, restClient } from './lib.mjs';
import {
  appendPlanBlock,
  appendScheduleEvent,
  appendStudySession,
  nextEventId,
  nextPlanId,
  nextSessionId,
  parsePlanBlocks,
  parseScheduleEvents,
  parseStudySessions,
  readVaultFile,
  writeVaultFile,
} from './vault/index.mjs';

const TABLE_ORDER = ['study_sessions', 'events', 'plan_blocks'];
const PAGE_SIZE = 500;

export function mapStudySessionRow(row, subjectName) {
  const session = { subject: subjectName, minutes: row.minutes, kind: row.record_type, understanding: row.understanding, memo: row.memo ?? '' };
  if (row.record_type === 'common_test') {
    session.year = row.common_test_year;
    session.section = row.common_test_section;
  }
  return session;
}

export function mapEventRow(row) {
  return { kind: row.kind, title: row.title, due: row.due_date, done: row.done };
}

export function mapPlanBlockRow(row, subjectName) {
  const block = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5), subject: subjectName, status: row.status, memo: row.memo ?? '' };
  if (row.recurrence_rule) block.hadRecurrence = true;
  return block;
}

function parseArgv(argv) {
  const options = { dryRun: false, force: false, fromTable: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') options.dryRun = true;
    else if (argv[index] === '--force') options.force = true;
    else if (argv[index] === '--from-table') options.fromTable = argv[++index];
  }
  if (options.fromTable && !TABLE_ORDER.includes(options.fromTable)) {
    throw new Error(`--from-table は ${TABLE_ORDER.join('|')} のいずれかを指定してください`);
  }
  return options;
}

async function fetchAllPages(client, table, query) {
  const rows = [];
  for (let offset = 0;; offset += PAGE_SIZE) {
    const page = await client.select(table, `${query}&limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchExactCount(table, filterQuery = '') {
  const { url, key } = loadEnv();
  const suffix = filterQuery ? `?select=id&${filterQuery}&limit=1` : '?select=id&limit=1';
  const response = await fetch(`${url}/rest/v1/${table}${suffix}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } });
  if (!response.ok) throw new Error(`Supabase REST GET ${table} (count) failed: ${response.status} ${await response.text()}`);
  const range = response.headers.get('content-range');
  const count = range?.includes('/') ? Number(range.split('/')[1]) : NaN;
  if (Number.isNaN(count)) throw new Error(`${table} の件数(Content-Range)を取得できませんでした`);
  return count;
}

export function createSupabaseMigrationClient() {
  const client = restClient();
  return {
    // The public migration interface intentionally exposes selectAll; this avoids
    // leaking the paged REST primitive to run() and makes its fake injectable.
    selectAll: (table, query) => fetchAllPages(client, table, query),
    count: (table, filterQuery) => fetchExactCount(table, filterQuery),
  };
}

async function destination(relPath, force) {
  try {
    const file = await readVaultFile(relPath);
    if (file.frontmatter.source === 'migration') return { exists: true, migrated: true };
    if (!force) throw new Error(`${relPath} は対話由来のデータで既に存在します。移行を続けるには --force を指定してください。`);
    return { exists: true, migrated: false };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, migrated: false };
    throw error;
  }
}

async function markMigrated(relPath) {
  const { frontmatter, body } = await readVaultFile(relPath);
  await writeVaultFile(relPath, { ...frontmatter, source: 'migration' }, body);
}

async function checkedRows(client, table, query) {
  const [expected, rows] = await Promise.all([client.count(table), client.selectAll(table, query)]);
  if (rows.length !== expected) throw new Error(`${table} の取得件数(${rows.length})とSupabase側の件数(${expected})が一致しません(ページングの取りこぼしの可能性)`);
  return rows;
}

function groupRowsBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

async function migrateStudySessions(client, names, options, warnings) {
  const rows = await checkedRows(client, 'study_sessions', 'select=id,subject_id,unit_id,material_id,minutes,study_date,record_type,common_test_year,common_test_section,understanding,memo&order=study_date.asc');
  const byDate = groupRowsBy(rows, (row) => row.study_date);
  let migrated = 0; let skipped = 0; const touched = [];
  for (const [date, dateRows] of byDate) {
    const relPath = `records/${date}.md`; const state = await destination(relPath, options.force);
    if (state.migrated) { skipped += dateRows.length; continue; }
    let existing = state.exists ? parseStudySessions((await readVaultFile(relPath)).body) : [];
    for (const row of dateRows) {
      if (row.unit_id) warnings.push(`study_sessions ${row.id}: unit_id が失われます`);
      if (row.material_id) warnings.push(`study_sessions ${row.id}: material_id が失われます`);
      if (options.dryRun) { migrated += 1; continue; }
      const session = { id: nextSessionId(existing), ...mapStudySessionRow(row, names.get(row.subject_id) ?? '不明') };
      existing = [...existing, session];
      await appendStudySession(date, session);
      migrated += 1;
    }
    if (!options.dryRun && dateRows.length) touched.push(relPath);
  }
  if (!options.dryRun) await Promise.all(touched.map(markMigrated));
  return { migrated, skipped };
}

async function migrateEvents(client, options) {
  const rows = await checkedRows(client, 'events', 'select=id,kind,title,due_date,done&order=due_date.asc');
  const relPath = 'schedule.md'; const state = await destination(relPath, options.force);
  if (state.migrated) return { migrated: 0, skipped: rows.length };
  let existing = state.exists ? parseScheduleEvents((await readVaultFile(relPath)).body) : [];
  let migrated = 0;
  for (const row of rows) {
    if (options.dryRun) { migrated += 1; continue; }
    const event = { id: nextEventId(existing), ...mapEventRow(row) };
    existing = [...existing, event]; await appendScheduleEvent(event); migrated += 1;
  }
  if (!options.dryRun && rows.length) await markMigrated(relPath);
  return { migrated, skipped: 0 };
}

async function migratePlanBlocks(client, names, options, warnings) {
  const rows = await checkedRows(client, 'plan_blocks', 'select=id,plan_date,start_time,end_time,subject_id,memo,status,recurrence_rule&order=plan_date.asc');
  const byDate = groupRowsBy(rows, (row) => row.plan_date);
  let migrated = 0; let skipped = 0; const touched = [];
  for (const [date, dateRows] of byDate) {
    const relPath = `plans/${date}.md`; const state = await destination(relPath, options.force);
    if (state.migrated) { skipped += dateRows.length; continue; }
    let existing = state.exists ? parsePlanBlocks((await readVaultFile(relPath)).body) : [];
    for (const row of dateRows) {
      const block = mapPlanBlockRow(row, row.subject_id ? (names.get(row.subject_id) ?? '不明') : '不明');
      if (block.hadRecurrence) { warnings.push(`plan_blocks ${row.id}: recurrence_rule(繰り返し設定)が失われます`); delete block.hadRecurrence; }
      if (options.dryRun) { migrated += 1; continue; }
      const withId = { id: nextPlanId(existing), ...block };
      existing = [...existing, withId]; await appendPlanBlock(date, withId); migrated += 1;
    }
    if (!options.dryRun && dateRows.length) touched.push(relPath);
  }
  if (!options.dryRun) await Promise.all(touched.map(markMigrated));
  return { migrated, skipped };
}

export async function run(argv = [], { createClient = createSupabaseMigrationClient } = {}) {
  const options = parseArgv(argv); const client = createClient(); const warnings = [];
  const start = options.fromTable ? TABLE_ORDER.indexOf(options.fromTable) : 0;
  const subjects = await client.selectAll('subjects', 'select=id,name');
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const migrated = { studySessions: 0, events: 0, planBlocks: 0 };
  const skipped = { studySessions: 0, events: 0, planBlocks: 0 };
  const tasks = [
    ['study_sessions', () => migrateStudySessions(client, names, options, warnings), 'studySessions'],
    ['events', () => migrateEvents(client, options), 'events'],
    ['plan_blocks', () => migratePlanBlocks(client, names, options, warnings), 'planBlocks'],
  ];
  for (let index = start; index < tasks.length; index += 1) {
    const [table, migrate, key] = tasks[index]; const result = await migrate();
    migrated[key] = result.migrated; skipped[key] = result.skipped;
    process.stdout.write(`progress: table=${table} migrated=${result.migrated} skipped=${result.skipped}\n`);
  }
  return { migrated, skipped, warnings, dryRun: options.dryRun };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  const result = await run(process.argv.slice(2));
  printJson(result);
  if (result.warnings.length) {
    console.warn(`\n警告: ${result.warnings.length}件の情報が移行時に失われました:`);
    for (const warning of result.warnings) console.warn(`  - ${warning}`);
  }
}
