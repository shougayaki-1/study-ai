#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, id]) {
  if (!date || !id) {
    throw new Error('使い方: node helpers/delete-session.mjs <date> <id>');
  }
  assertValidStudySessionFields({ date });
  const { deleteStudySession } = await import('./vault/index.mjs');
  await deleteStudySession(date, id);
  return { date, id, deleted: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
