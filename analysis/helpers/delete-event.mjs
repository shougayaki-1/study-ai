#!/usr/bin/env node
import { fileURLToPath } from 'node:url'; import { printJson } from './lib.mjs';
export async function run([id]) { if(!id) throw new Error('使い方: node helpers/delete-event.mjs <id>'); const {deleteScheduleEvent}=await import('./vault/index.mjs'); await deleteScheduleEvent(id); return {id,deleted:true}; }
if(process.argv[1]===fileURLToPath(import.meta.url)) printJson(await run(process.argv.slice(2)));
