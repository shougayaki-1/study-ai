#!/usr/bin/env node
// Storageから解析済みPDF/写真の原本ファイルを削除する(容量削減用)。
// DBの photos 行・question_results・mock_exams 等は消さず、Storage上のファイルだけを削除する。
// 使い方: node helpers/delete-photo-file.mjs <storage_path>
import { deleteStorageObject, printJson } from './lib.mjs';

const [, , storagePath] = process.argv;
if (!storagePath) {
  console.error('使い方: node helpers/delete-photo-file.mjs <storage_path>');
  process.exit(1);
}
const result = await deleteStorageObject('photos', storagePath);
printJson(result);
