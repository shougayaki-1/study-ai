#!/usr/bin/env node
import { fileURLToPath } from 'node:url'; import { printJson } from './lib.mjs';
const KINDS = ['assignment','application','mock_exam','exam','other']; const DATE = /^\d{4}-\d{2}-\d{2}$/;
export async function run([kind, title, due]) { if (!kind || !title || !due) throw new Error('使い方: node helpers/add-event.mjs <kind> <title> <due>'); if (!KINDS.includes(kind)) throw new Error('invalid kind'); if (!DATE.test(due)) throw new Error('due は YYYY-MM-DD 形式である必要があります'); const v = await import('./vault/index.mjs'); let body=''; try { ({body}=await v.readVaultFile('schedule.md')); } catch (e) { if(e.code!=='ENOENT') throw e; } const event={id:v.nextEventId(v.parseScheduleEvents(body)),kind,title,due,done:false}; await v.appendScheduleEvent(event); return event; }
if(process.argv[1]===fileURLToPath(import.meta.url)) printJson(await run(process.argv.slice(2)));
