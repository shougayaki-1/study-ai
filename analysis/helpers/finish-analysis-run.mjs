#!/usr/bin/env node
import { restClient, printJson } from './lib.mjs';
const [, , id, status = 'completed', summary = '{}'] = process.argv;
if (!id || !['completed', 'failed'].includes(status)) throw new Error('使い方: finish-analysis-run.mjs <id> <completed|failed> [summary_json]');
const db = restClient();
const rows = await db.update('analysis_runs', { status, summary_json: JSON.parse(summary), completed_at: new Date().toISOString() }, `id=eq.${id}`);
printJson(rows[0]);
