// 河合「教科学習結果 > 学習履歴」PDF の決定的アダプタ。
// 純関数部は実PDFなしで検証できるよう外部コマンド層と分離する。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attemptId } from '../vault/attempts.mjs';
import { parsePpm, sampleRect } from './ppm.mjs';

export const ADAPTER = { name: 'kawai-tokumo-history', version: '1.0.0', method: 'deterministic' };
export const SOURCE_SYSTEM = 'kawai';
export const MATERIAL_NAME = '河合 学習履歴 / 範囲選択';

const HEADER_TOKENS = ['学習履歴', '解答終了日時', '解答時間', '区分'];
const DURATION_RE = /^\d{2}:\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;
const QNO_RE = /^\d{3}$/;
const TOPIC_SEP = '＜';
const LINE_TOLERANCE = 4;
const SUBJECT_ZONE_MARGIN = 60;

export function detectFromText(firstPageText) {
  if (!firstPageText) return false;
  return HEADER_TOKENS.every((token) => firstPageText.includes(token));
}

function toSeconds(hhmmss) {
  return hhmmss.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

const centerX = (word) => (word.x0 + word.x1) / 2;
const centerY = (word) => (word.y0 + word.y1) / 2;

function lastWord(words, text) {
  const matches = words.filter((word) => word.t === text);
  return matches.at(-1);
}

function toSubLines(words) {
  const lines = [];
  for (const word of words.slice().sort((a, b) => centerY(a) - centerY(b))) {
    const y = centerY(word);
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= LINE_TOLERANCE);
    if (line) line.words.push(word);
    else lines.push({ y, words: [word] });
  }
  for (const line of lines) line.words.sort((a, b) => a.x0 - b.x0);
  return lines;
}

export function parseRows(words) {
  const markHeader = lastWord(words, '正誤');
  const subjectHeader = lastWord(words, '科目');
  if (!markHeader || !subjectHeader) return [];
  const subjectZone = centerX(subjectHeader) - SUBJECT_ZONE_MARGIN;

  const durations = words
    .filter((word) => DURATION_RE.test(word.t) && word.y0 > markHeader.y1)
    .sort((a, b) => a.y0 - b.y0);

  return durations.map((duration, index) => {
    const yCenter = centerY(duration);
    const halfHeight = (duration.y1 - duration.y0) * 0.8;
    const band = words.filter((word) => {
      const y = centerY(word);
      return y > yCenter - halfHeight && y < yCenter + halfHeight;
    });

    const date = band.find((word) => DATE_RE.test(word.t));
    const hhmm = band.find((word) => HHMM_RE.test(word.t));
    const question = band.find((word) => QNO_RE.test(word.t) && word.x0 > duration.x1);
    const contentLeft = question ? question.x1 : duration.x1;
    const topicTokens = [];
    const subjectTokens = [];

    for (const line of toSubLines(band)) {
      const cells = line.words.filter(
        (word) => word.t.trim() && word.t.trim() !== '解答を見る' && word.x0 > contentLeft
      );
      if (cells.length === 0) continue;

      let splitAt = cells.length;
      let widestGap = -1;
      for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
        if (cells[cellIndex].x0 < subjectZone) continue;
        const gap = cells[cellIndex].x0 - cells[cellIndex - 1].x1;
        if (gap > widestGap) {
          widestGap = gap;
          splitAt = cellIndex;
        }
      }
      if (cells[0].x0 >= subjectZone) splitAt = 0;

      cells.forEach((cell, cellIndex) => {
        (cellIndex < splitAt ? topicTokens : subjectTokens).push(cell.t.trim());
      });
    }

    const topicParts = [];
    let current = '';
    for (const token of topicTokens) {
      if (token === TOPIC_SEP) {
        if (current) topicParts.push(current);
        current = '';
      } else {
        current += token;
      }
    }
    if (current) topicParts.push(current);

    return {
      index,
      at: date && hhmm ? `${date.t} ${hhmm.t}` : null,
      durationSec: toSeconds(duration.t),
      questionNo: question?.t ?? null,
      topicParts,
      topicRaw: topicParts.join(` ${TOPIC_SEP} `),
      subjectRaw: subjectTokens.join(''),
      markRect: {
        x0: markHeader.x0,
        x1: markHeader.x1,
        y0: yCenter - halfHeight,
        y1: yCenter + halfHeight,
      },
    };
  });
}

export function classifyMark(pixels) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (const pixel of pixels) {
    if (Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b) < 50) continue;
    red += pixel.r;
    green += pixel.g;
    blue += pixel.b;
    count += 1;
  }
  if (count === 0) return 'unknown';

  const r = red / count;
  const g = green / count;
  const b = blue / count;
  if (g > r * 1.15 && g > b) return 'correct';
  if (r > g * 1.15 && g > b * 1.8) return 'partial';
  if (r > g * 1.6 && r > b * 1.6) return 'incorrect';
  return 'unknown';
}

function toIsoJst(at) {
  if (!at) return null;
  const [date, time] = at.split(' ');
  return `${date.replaceAll('/', '-')}T${time}:00+09:00`;
}

export function toAttempts({ rows, marks, page, artifactRef, artifactSha256, ingestedAt }) {
  if (rows.length !== marks.length) {
    throw new Error(`toAttempts: rows(${rows.length}) と marks(${marks.length}) の件数が一致しません`);
  }

  return rows.map((row, index) => {
    const occurredAt = toIsoJst(row.at);
    return {
      id: attemptId(artifactSha256, page, row.index),
      schema_version: 1,
      occurred_at: occurredAt,
      occurred_date: occurredAt?.slice(0, 10) ?? null,
      ingested_at: ingestedAt,
      source_system: SOURCE_SYSTEM,
      artifact_ref: artifactRef,
      artifact_sha256: artifactSha256,
      extractor: { ...ADAPTER },
      subject: row.subjectRaw,
      subject_raw: row.subjectRaw,
      topic_path: [...row.topicParts].reverse(),
      topic_path_raw: row.topicRaw,
      material: { name: MATERIAL_NAME, question_no: row.questionNo },
      result: marks[index],
      duration_sec: row.durationSec,
      error_type: null,
      confidence: 1,
      confirmation_status: 'unreviewed',
      record_status: 'active',
      supersedes: null,
      note: null,
    };
  });
}

const RENDER_DPI = 150;

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function pageCount(file) {
  const match = /Pages:\s+(\d+)/.exec(run('pdfinfo', [file]));
  if (!match) throw new Error(`pdfinfo がページ数を返しませんでした: ${file}`);
  return Number(match[1]);
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function wordsOf(file, page) {
  const xml = run('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), file, '-']);
  const words = [];
  const pattern = /<word xMin="(-?[\d.]+)" yMin="(-?[\d.]+)" xMax="(-?[\d.]+)" yMax="(-?[\d.]+)">([^<]*)<\/word>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    words.push({
      x0: Number(match[1]), y0: Number(match[2]), x1: Number(match[3]), y1: Number(match[4]),
      t: decodeXmlEntities(match[5]),
    });
  }
  return words;
}

function renderPage(file, page) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kawai-ppm-'));
  try {
    const prefix = path.join(dir, 'page');
    execFileSync('pdftoppm', ['-r', String(RENDER_DPI), '-f', String(page), '-l', String(page), file, prefix], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const rendered = readdirSync(dir).find((name) => name.endsWith('.ppm'));
    if (!rendered) throw new Error(`pdftoppm がページ ${page} の PPM を生成しませんでした`);
    return parsePpm(readFileSync(path.join(dir, rendered)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function detect(file) {
  return detectFromText(run('pdftotext', ['-f', '1', '-l', '1', file, '-']));
}

export async function extract({ file, artifactRef, ingestedAt }) {
  const artifactSha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  const pages = pageCount(file);
  const scale = RENDER_DPI / 72;
  const attempts = [];
  let unknownMarks = 0;

  for (let page = 1; page <= pages; page += 1) {
    const rows = parseRows(wordsOf(file, page));
    if (rows.length === 0) continue;

    const image = renderPage(file, page);
    const marks = rows.map((row) => classifyMark(sampleRect(image, {
      x0: (row.markRect.x0 - 3) * scale,
      y0: row.markRect.y0 * scale,
      x1: (row.markRect.x1 + 3) * scale,
      y1: row.markRect.y1 * scale,
    })));
    unknownMarks += marks.filter((mark) => mark === 'unknown').length;
    attempts.push(...toAttempts({ rows, marks, page, artifactRef, artifactSha256, ingestedAt }));
  }

  if (attempts.length === 0) {
    throw new Error(`${artifactRef}: 河合形式と判定されたのに1行も抽出できませんでした。フォーマットが変更された可能性があります。`);
  }
  return { attempts, unknownMarks, pages };
}
