#!/usr/bin/env node
import { fileURLToPath } from 'node:url'; import { printJson } from './lib.mjs';
import { loadVaultEnv } from './vault/env.mjs';
const KINDS=['assignment','application','mock_exam','exam','other']; const DATE=/^\d{4}-\d{2}-\d{2}$/;
export async function run([id, patchArg]) { if(!id||!patchArg) throw new Error('使い方: node helpers/edit-event.mjs <id> <patchJSON>'); const patch=JSON.parse(patchArg); if(patch.kind!==undefined&&!KINDS.includes(patch.kind)) throw new Error('invalid kind'); if(patch.due!==undefined&&!DATE.test(patch.due)) throw new Error('due は YYYY-MM-DD 形式である必要があります'); const {updateScheduleEvent}=await import('./vault/index.mjs'); await updateScheduleEvent(id,patch); return {id,patch}; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { loadVaultEnv(); printJson(await run(process.argv.slice(2))); }
