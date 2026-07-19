#!/usr/bin/env node
// 全履歴から現在の単元状態・提案履歴・試験予定・週間学習時間を組み立てる。
import { restClient, printJson } from './lib.mjs';
import { computeAdaptiveState, understandingPerformance } from './adaptive-interval.mjs';

const db = restClient();
const [subjects, units, materials, materialUnits, sessions, results, tasks, events, eventSubjects, eventUnits, weeklyPlans, planBlocks] = await Promise.all([
  db.select('subjects', 'select=id,name,is_target,input_profile,columns_enabled&order=sort_order'),
  db.select('units', 'select=id,subject_id,name,is_target&order=sort_order'),
  db.select('materials', 'select=id,subject_id,name,kind,difficulty'),
  db.select('material_units', 'select=material_id,unit_id'),
  db.select('study_sessions', 'select=id,batch_id,unit_id,subject_id,material_id,minutes,study_date,understanding,range_text,topic_tag,created_at&order=created_at.desc'),
  db.select('question_results', 'select=id,photo_id,unit_id,is_correct,score_rate,result_granularity,error_type,confidence,corrected_at,created_at&unit_id=not.is.null&order=created_at.desc'),
  db.select('review_tasks', 'select=id,subject_id,unit_id,due_date,status,completed_at,priority_score,source_kind,evidence_json&order=created_at.desc'),
  db.select('events', 'select=id,title,kind,due_date,done&done=eq.false&order=due_date.asc'),
  db.select('event_subjects', 'select=event_id,subject_id'),
  db.select('event_units', 'select=event_id,unit_id'),
  db.select('weekly_plans', 'select=*&order=week_start.desc&limit=8'),
  db.select('plan_blocks', 'select=id,plan_date,status,linked_session_batch_id&recurrence_rule=is.null&order=plan_date.desc'),
]);

const now = new Date();
const today = now.toISOString().slice(0, 10);
const subjectById = new Map(subjects.map((row) => [row.id, row]));
const materialById = new Map(materials.map((row) => [row.id, row]));
const performanceOf = (row) => row.score_rate != null ? Number(row.score_rate) / 100 : row.is_correct === true ? 1 : row.is_correct === false ? 0 : null;
const adaptiveEventsByUnit = new Map();
for (const unit of units) {
  const groupedResults = new Map();
  for (const result of results.filter((row) => row.unit_id === unit.id)) {
    const performance = performanceOf(result);
    if (performance == null) continue;
    const key = result.photo_id ?? result.id;
    const group = groupedResults.get(key) ?? { date: result.created_at, values: [] };
    group.values.push(performance);
    groupedResults.set(key, group);
  }
  const resultEvents = [...groupedResults.values()].map((group) => ({ date: group.date, performance: group.values.reduce((sum, value) => sum + value, 0) / group.values.length }));
  const groupedSessions = new Map();
  for (const session of sessions.filter((row) => row.unit_id === unit.id)) {
    const performance = understandingPerformance(session.understanding);
    if (performance == null) continue;
    const key = session.batch_id ?? session.id;
    if (!groupedSessions.has(key)) groupedSessions.set(key, { date: session.created_at, performance });
  }
  adaptiveEventsByUnit.set(unit.id, [...resultEvents, ...groupedSessions.values()]);
}
const adaptiveEventCount = [...adaptiveEventsByUnit.values()].reduce((sum, events) => sum + events.length, 0);
const stateRows = [];
for (const unit of units.filter((row) => row.is_target && subjectById.get(row.subject_id)?.is_target)) {
  const unitSessions = sessions.filter((row) => row.unit_id === unit.id);
  const unitResults = results.filter((row) => row.unit_id === unit.id);
  const recent30 = unitResults.slice(0, 30);
  const recent10 = unitResults.slice(0, 10);
  const recentPerformances = recent30.map(performanceOf).filter((value) => value != null);
  const recent10Performances = recent10.map(performanceOf).filter((value) => value != null);
  const accuracy = recentPerformances.length ? recentPerformances.reduce((sum, value) => sum + value, 0) / recentPerformances.length : null;
  const recentAccuracy = recent10Performances.length ? recent10Performances.reduce((sum, value) => sum + value, 0) / recent10Performances.length : null;
  const currentUnderstanding = unitSessions.find((row) => row.understanding)?.understanding ?? null;
  const lastDate = unitSessions[0]?.created_at ?? unitResults[0]?.created_at ?? null;
  const elapsedDays = lastDate ? Math.max(0, (now.getTime() - new Date(lastDate).getTime()) / 86400000) : null;
  const hasData = unitSessions.length > 0 || unitResults.length > 0;
  let state = 'learning';
  if (!hasData) state = 'undiagnosed';
  else if (currentUnderstanding === 'not_understood' || (accuracy != null && accuracy < 0.45)) state = 'foundation';
  else if (elapsedDays != null && elapsedDays >= 14) state = 'review';
  else if (currentUnderstanding === 'understood' && (accuracy == null || accuracy >= 0.75)) state = 'mastered';
  const weaknessScore = accuracy == null ? 0 : (1 - accuracy) * (1 + Math.log(1 + (elapsedDays ?? 0)) / 2);
  const errors = recent30.filter((row) => row.is_correct === false || (row.score_rate != null && row.score_rate < 70)).reduce((acc, row) => {
    const key = row.error_type ?? 'other';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const compatibleMaterials = materialUnits.filter((link) => link.unit_id === unit.id).map((link) => materialById.get(link.material_id)).filter(Boolean);
  // 直近の学習範囲・知識トピックの履歴(次の範囲の提案・弱点トピックの特定に使う)
  const rangeHistory = unitSessions.filter((row) => row.range_text).slice(0, 5).map((row) => row.range_text);
  const topicTagHistory = unitSessions.filter((row) => row.topic_tag).slice(0, 5).map((row) => row.topic_tag);
  const adaptive = computeAdaptiveState(adaptiveEventsByUnit.get(unit.id) ?? []);
  const adaptiveEnabled = adaptiveEventCount >= 30 && adaptive.reviewCount >= 3;
  const evidence = { attempts: unitResults.length, sessionCount: unitSessions.length, recent30Accuracy: accuracy, recent10Accuracy: recentAccuracy, improving: accuracy != null && recentAccuracy != null && recentAccuracy >= accuracy + 0.1, elapsedDays, errors, unreviewedErrors: unitResults.filter((row) => !row.corrected_at && (row.is_correct === false || (row.score_rate != null && row.score_rate < 70))).length, previousTasks: tasks.filter((task) => task.unit_id === unit.id).slice(0, 10), materials: compatibleMaterials, rangeHistory, topicTagHistory, adaptiveEnabled };
  stateRows.push({ unit_id: unit.id, snapshot_date: today, state, weakness_score: Math.round(weaknessScore * 1000) / 1000, accuracy: accuracy == null ? null : Math.round(accuracy * 1000) / 1000, understanding: currentUnderstanding, last_studied_at: lastDate, stability_days: adaptiveEnabled ? adaptive.stabilityDays : null, next_review_date: adaptiveEnabled ? adaptive.nextReviewDate : null, review_count: adaptive.reviewCount, evidence_json: evidence, unit_name: unit.name, subject_name: subjectById.get(unit.subject_id)?.name });
}

await db.upsert('unit_state_snapshots', stateRows.map((row) => ({
  unit_id: row.unit_id,
  snapshot_date: row.snapshot_date,
  state: row.state,
  weakness_score: row.weakness_score,
  accuracy: row.accuracy,
  understanding: row.understanding,
  last_studied_at: row.last_studied_at,
  stability_days: row.stability_days,
  next_review_date: row.next_review_date,
  review_count: row.review_count,
  evidence_json: row.evidence_json,
})), 'unit_id,snapshot_date');
await db.update('review_tasks', { status: 'expired' }, `status=eq.pending&due_date=lt.${today}`);
const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10);
const recentMinutes = sessions.filter((row) => row.study_date >= fourWeeksAgo).reduce((sum, row) => sum + row.minutes, 0);
const estimatedWeeklyMinutes = Math.round(recentMinutes / 4 / 5) * 5;
const nextWeek = new Date(now);
nextWeek.setDate(nextWeek.getDate() + 7 - ((nextWeek.getDay() + 6) % 7));
const nextWeekStart = nextWeek.toISOString().slice(0, 10);
const existingPlan = weeklyPlans.find((row) => row.week_start === nextWeekStart);
await db.upsert('weekly_plans', [{ week_start: nextWeekStart, estimated_minutes: estimatedWeeklyMinutes, adjusted_minutes: existingPlan?.adjusted_minutes ?? null, updated_at: now.toISOString() }], 'week_start');
const effectiveWeeklyMinutes = existingPlan?.adjusted_minutes ?? estimatedWeeklyMinutes;
const executionCutoff = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10);
const maturedBlocks = planBlocks.filter((row) => row.plan_date >= executionCutoff && row.plan_date < today);
const completedBlocks = maturedBlocks.filter((row) => row.status === 'done').length;
const planExecution = { total: maturedBlocks.length, completed: completedBlocks, rate: maturedBlocks.length ? completedBlocks / maturedBlocks.length : null, proposalCountHint: maturedBlocks.length >= 20 && completedBlocks / maturedBlocks.length < 0.6 ? 3 : 5 };
printJson({ generatedAt: now.toISOString(), stateRows, adaptiveEventCount, estimatedWeeklyMinutes, effectiveWeeklyMinutes, planExecution, subjects, upcomingEvents: events.map((event) => ({ ...event, subjectIds: eventSubjects.filter((row) => row.event_id === event.id).map((row) => row.subject_id), unitIds: eventUnits.filter((row) => row.event_id === event.id).map((row) => row.unit_id) })) });
