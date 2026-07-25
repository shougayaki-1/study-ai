import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConfirmTodoLine, buildConfirmTodoSection, buildDailyReportBody, buildDailyReportFrontmatter } from '../helpers/build-daily-report.mjs';

test('formatConfirmTodoLine matches the contract 3a line format exactly', () => {
  const line = formatConfirmTodoLine({
    id: 'todo-1',
    q: 'この写真の科目は？',
    options: ['日本史', '世界史', '不明'],
    default: '日本史',
    ref: '_archive/2026/07/abc.jpg',
  });
  assert.equal(
    line,
    '- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg'
  );
});

test('formatConfirmTodoLine omits ref when not provided', () => {
  const line = formatConfirmTodoLine({ id: 'todo-2', q: '単元は？', options: ['三角比', '不明'], default: '不明' });
  assert.equal(line, '- [ ] id=todo-2 | q=単元は？ | options=三角比 / 不明 | default=不明');
  assert.ok(!line.includes('ref='));
});

test('buildConfirmTodoSection lists every todo under the 要確認TODO heading', () => {
  const section = buildConfirmTodoSection([
    { id: 'todo-1', q: 'q1', options: ['a', 'b'], default: 'a' },
    { id: 'todo-2', q: 'q2', options: ['c', 'd'], default: 'c' },
  ]);
  const lines = section.split('\n');
  assert.equal(lines[0], '## 要確認TODO');
  assert.equal(lines.filter((line) => line.startsWith('- [ ] id=')).length, 2);
});

test('buildConfirmTodoSection reports no items clearly when there are none', () => {
  const section = buildConfirmTodoSection([]);
  assert.match(section, /## 要確認TODO/);
  assert.match(section, /要確認事項なし/);
});

test('buildDailyReportBody puts the 要確認TODO section first, before other sections', () => {
  const body = buildDailyReportBody({
    date: '2026-07-24',
    confirmTodos: [{ id: 'todo-1', q: 'q', options: ['a', 'b'], default: 'a' }],
    sections: [{ heading: '今日の学習時間', body: '120分' }],
  });
  assert.ok(body.indexOf('## 要確認TODO') < body.indexOf('## 今日の学習時間'));
  assert.match(body, /120分/);
});

test('buildDailyReportFrontmatter sets confirm_todos to the todo count', () => {
  const fm = buildDailyReportFrontmatter('2026-07-24', [{ id: 'todo-1' }, { id: 'todo-2' }], '2026-07-24T23:40:00+09:00');
  assert.equal(fm.type, 'daily-report');
  assert.equal(fm.date, '2026-07-24');
  assert.equal(fm.confirm_todos, 2);
  assert.equal(fm.schema_version, 1);
});
