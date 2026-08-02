// attempts から単元別の状態を計算する純関数群。

const RECENT_WINDOW = 5;
const RECENT_ATTEMPTS_LIMIT = 20;
const MIN_EVIDENCE = 3;
const WEAK_THRESHOLD = 0.6;
const UNSTABLE_SWITCHES = 2;
const UNKNOWN_SUBJECT = '(科目未判定)';
const UNKNOWN_TOPIC = '(単元未判定)';

function score(result) {
  if (result === 'correct') return 1;
  if (result === 'partial') return 0.5;
  return 0;
}

export function computeState(results) {
  if (results.length < MIN_EVIDENCE) return 'insufficient';
  const recent = results.slice(-RECENT_WINDOW);
  const accuracy = recent.reduce((sum, result) => sum + score(result), 0) / recent.length;
  if (accuracy < WEAK_THRESHOLD) return 'weak';

  let switches = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if ((recent[index] === 'correct') !== (recent[index - 1] === 'correct')) switches += 1;
  }
  if (switches >= UNSTABLE_SWITCHES) return 'unstable';
  return 'stable';
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function chronologicalKey(attempt) {
  return attempt.occurred_at || attempt.occurred_date || '9999';
}

export function buildSkills(attempts, generatedAt) {
  const bySubject = new Map();
  for (const attempt of attempts) {
    const subject = attempt.subject || UNKNOWN_SUBJECT;
    const topicPath = Array.isArray(attempt.topic_path) && attempt.topic_path.length > 0
      ? attempt.topic_path
      : [UNKNOWN_TOPIC];
    const key = topicPath.join(' > ');
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const topics = bySubject.get(subject);
    if (!topics.has(key)) topics.set(key, { topicPath, rows: [] });
    topics.get(key).rows.push(attempt);
  }

  const output = {};
  for (const [subject, topics] of bySubject) {
    const list = [];
    for (const [key, { topicPath, rows }] of topics) {
      rows.sort((a, b) => chronologicalKey(a).localeCompare(chronologicalKey(b)));
      const results = rows.map((row) => row.result);
      const durations = rows.map((row) => row.duration_sec).filter((duration) => typeof duration === 'number');
      const dates = rows.map((row) => row.occurred_date).filter(Boolean);

      list.push({
        key,
        topic_path: topicPath,
        group: topicPath.length >= 2 ? topicPath.at(-2) : '',
        name: topicPath.at(-1),
        attempts: rows.length,
        correct: results.filter((result) => result === 'correct').length,
        accuracy: round3(results.reduce((sum, result) => sum + score(result), 0) / results.length),
        recent: results.slice(-RECENT_WINDOW),
        last_practiced_date: dates.at(-1) ?? null,
        avg_duration_sec: durations.length > 0
          ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
          : null,
        state: computeState(results),
        recent_attempts: rows.slice(-RECENT_ATTEMPTS_LIMIT).map((row) => ({
          date: row.occurred_date ?? null,
          result: row.result,
          duration_sec: row.duration_sec ?? null,
          question_no: row.material?.question_no ?? null,
          artifact_ref: row.artifact_ref,
        })),
      });
    }
    list.sort((a, b) => a.key.localeCompare(b.key, 'ja'));
    output[subject] = { schema_version: 1, subject, generated_at: generatedAt, topics: list };
  }
  return output;
}
