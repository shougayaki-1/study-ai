#!/usr/bin/env node
import { fileURLToPath } from 'node:url'; import { printJson } from './lib.mjs'; import { validate } from './add-plan-block.mjs';
export async function run([date,id]){if(!date||!id)throw new Error('usage');validate(date);const {deletePlanBlock}=await import('./vault/index.mjs');await deletePlanBlock(date,id);return {date,id,deleted:true}}
if(process.argv[1]===fileURLToPath(import.meta.url))printJson(await run(process.argv.slice(2)));
