export const STUDY_SUBJECTS = [
  '英語R', '英語L', '現代文', '古文', '漢文', '数学IA', '数学2BC',
  '化学基礎', '地学基礎', '地理', '政治経済', '情報', '小論文',
];

const KINDS = ['material', 'common_test', 'secondary'];
const UNDERSTANDINGS = ['understood', 'uncertain', 'not_understood'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidStudySessionFields({ date, subject, minutes, kind, understanding } = {}) {
  if (date !== undefined && !DATE_RE.test(date)) {
    throw new Error(`date must match YYYY-MM-DD: ${date}`);
  }
  if (minutes !== undefined) {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`minutes must be a positive integer: ${minutes}`);
    }
  }
  if (subject !== undefined && !STUDY_SUBJECTS.includes(subject)) {
    throw new Error(`subject must be one of the 13 known subjects: ${subject}`);
  }
  if (kind !== undefined && !KINDS.includes(kind)) {
    throw new Error(`kind must be one of ${KINDS.join('/')}: ${kind}`);
  }
  if (understanding !== undefined && !UNDERSTANDINGS.includes(understanding)) {
    throw new Error(`understanding must be one of ${UNDERSTANDINGS.join('/')}: ${understanding}`);
  }
}
