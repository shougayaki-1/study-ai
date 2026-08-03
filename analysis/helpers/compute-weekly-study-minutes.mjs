#!/usr/bin/env node
// 指定されたISO週(YYYY-Www)の月曜〜日曜について、records/*.mdの実績から
// 科目別の合計学習時間(分)を集計する。週次レポートのchartデータ生成に使う。
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { loadVaultEnv } from './vault/env.mjs';

export function isoWeekToMonday(weekStr) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekStr);
  if (!match) throw new Error(`Invalid ISO week: ${weekStr}`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target.toISOString().slice(0, 10);
}

export function datesInWeek(weekStr) {
  const monday = isoWeekToMonday(weekStr);
  const start = new Date(`${monday}T00:00:00Z`);
  const dates = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function computeWeeklyStudyMinutes(recordDays) {
  const bySubject = new Map();
  for (const day of recordDays) {
    for (const session of day.sessions) {
      bySubject.set(
        session.subject,
        (bySubject.get(session.subject) ?? 0) + session.minutes,
      );
    }
  }
  const series = Array.from(bySubject.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  return { type: 'bar', unit: '分', series };
}

export async function run([weekStr]) {
  if (!weekStr) {
    throw new Error(
      '使い方: node helpers/compute-weekly-study-minutes.mjs <weekStr(YYYY-Www)>',
    );
  }
  const { parseStudySessions, readVaultFile } = await import('./vault/index.mjs');
  const dates = datesInWeek(weekStr);
  const recordDays = [];
  for (const date of dates) {
    try {
      const { body } = await readVaultFile(`records/${date}.md`);
      recordDays.push({ date, sessions: parseStudySessions(body) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      recordDays.push({ date, sessions: [] });
    }
  }
  return computeWeeklyStudyMinutes(recordDays);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
