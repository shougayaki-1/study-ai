#!/usr/bin/env node
import { restClient, printJson } from './lib.mjs';
const db = restClient();
const engine = process.env.STUDY_AI_AGENT_CLI || 'claude';
const model = process.env.STUDY_AI_AGENT_MODEL || 'default';
const inserted = await db.insert('analysis_runs', [{ engine, model, status: 'running' }]);
printJson(inserted[0]);
