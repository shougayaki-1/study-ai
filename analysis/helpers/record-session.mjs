#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, subject, minutes, kind, understanding, memo, year, section]) {
  if (!date || !subject || !minutes || !kind || !understanding) {
    throw new Error('使い方: node helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo> [year] [section]');
  }
  assertValidStudySessionFields({ date, subject, minutes, kind, understanding });
  const { readVaultFile, parseStudySessions, nextSessionId, appendStudySession } = await import('./vault/index.mjs');
  let existingSessions = [];
  try {
    const { body } = await readVaultFile(`records/${date}.md`);
    existingSessions = parseStudySessions(body);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const session = {
    id: nextSessionId(existingSessions),
    subject,
    minutes: Number(minutes),
    kind,
    understanding,
    memo: memo ?? '',
  };
  if (kind === 'common_test') {
    if (year) session.year = Number(year);
    if (section) session.section = section;
  }
  await appendStudySession(date, session);
  return { date, session };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
