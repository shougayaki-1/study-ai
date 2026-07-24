import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, stringifyFrontmatter } from '../helpers/vault/frontmatter.mjs';

// NOTE: src/lib/vault/frontmatter.test.ts の FIXTURE_RAW と一字一句同一に保つ
//       (契約: TS版とNode版でパース結果を完全一致させる)
const FIXTURE_RAW = [
  '---',
  'type: karte',
  'subject: 日本史',
  'updated: 2026-07-24T23:40:00+09:00',
  'source: nightly-batch',
  'schema_version: 1',
  '---',
  '',
  '# 弱点カルテ',
  '',
  '本文...',
].join('\n');

const FIXTURE_FRONTMATTER = {
  type: 'karte',
  subject: '日本史',
  updated: '2026-07-24T23:40:00+09:00',
  source: 'nightly-batch',
  schema_version: 1,
};

const FIXTURE_BODY = '# 弱点カルテ\n\n本文...';

test('parseFrontmatter parses frontmatter fields and body', () => {
  const { frontmatter, body } = parseFrontmatter(FIXTURE_RAW);
  assert.deepEqual(frontmatter, FIXTURE_FRONTMATTER);
  assert.equal(body, FIXTURE_BODY);
});

test('parseFrontmatter throws when the opening delimiter is missing', () => {
  assert.throws(
    () => parseFrontmatter('no frontmatter here'),
    /vault file is missing frontmatter opening delimiter \(---\)/
  );
});

test('parseFrontmatter throws when the closing delimiter is missing', () => {
  assert.throws(
    () => parseFrontmatter('---\ntype: karte\nbody only'),
    /vault file is missing frontmatter closing delimiter \(---\)/
  );
});

test('stringifyFrontmatter produces the exact contract format and round-trips', () => {
  const raw = stringifyFrontmatter(FIXTURE_FRONTMATTER, FIXTURE_BODY);
  assert.equal(raw, FIXTURE_RAW);
  assert.deepEqual(parseFrontmatter(raw), { frontmatter: FIXTURE_FRONTMATTER, body: FIXTURE_BODY });
});
