import test from 'node:test';
import assert from 'node:assert/strict';
import { filterInboxEntries, isProcessableInboxEntry } from '../helpers/list-inbox-items.mjs';

test('excludes corrections.md, hidden files, and Drive sync temp files', () => {
  const names = [
    'photo1.jpg',
    'corrections.md',
    '.DS_Store',
    'scan.pdf.tmp',
    'report.pdf.crdownload',
    'note.txt.icloud',
    'quiz.pdf',
  ];
  assert.deepEqual(filterInboxEntries(names), ['photo1.jpg', 'quiz.pdf']);
});

test('keeps ordinary image and pdf names', () => {
  assert.equal(isProcessableInboxEntry('IMG_0001.jpeg'), true);
  assert.equal(isProcessableInboxEntry('mock-exam.pdf'), true);
});
