import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStudySessions, formatStudySessionLine, nextSessionId } from '../helpers/vault/study-sessions.mjs';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const body = readFileSync(path.join(fixtureDir, 'fixtures', 'study-record.md'), 'utf8');

test('parseStudySessions parses the shared fixture', () => {
  assert.deepEqual(parseStudySessions(body), [
    { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題' },
    { id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '' },
  ]);
});
test('parseStudySessions returns [] for a body with no session lines', () => assert.deepEqual(parseStudySessions('本文だけ\n'), []));
test('parseStudySessions skips missing required key', () => assert.deepEqual(parseStudySessions('- id=s-9 | subject=英語R | kind=material | understanding=understood | memo='), []));
test('formatStudySessionLine formats material', () => assert.equal(formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題' }), '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題'));
test('formatStudySessionLine formats common_test', () => assert.equal(formatStudySessionLine({ id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '' }), '- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo='));
test('formatter rejects delimiter', () => assert.throws(() => formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'a | b' })));
test('formatter rejects newline', () => assert.throws(() => formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'a\nb' })));
test('formatter allows equals', () => assert.match(formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'y=mx+b' }), /memo=y=mx\+b/));
test('nextSessionId allocates after max valid ID', () => { assert.equal(nextSessionId([]), 's-1'); assert.equal(nextSessionId([{ id: 's-1' }, { id: 's-2' }]), 's-3'); });
