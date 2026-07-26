#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, id, patchArg]) {
  if (!date || !id || !patchArg) {
    throw new Error('使い方: node helpers/edit-session.mjs <date> <id> <patchJSON>');
  }
  const patch = JSON.parse(patchArg);
  assertValidStudySessionFields({ date, ...patch });
  const { updateStudySession } = await import('./vault/index.mjs');
  await updateStudySession(date, id, patch);
  return { date, id, patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
