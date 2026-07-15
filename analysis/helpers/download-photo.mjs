#!/usr/bin/env node
// Storageから画像をダウンロードし analysis/tmp/ に保存、ローカルパスを返す
// 使い方: node helpers/download-photo.mjs <storage_path> [destFileName]
import path from 'node:path';
import { downloadStorageObject, printJson, TMP_DIR } from './lib.mjs';

const [, , storagePath, destFileName] = process.argv;
if (!storagePath) {
  console.error('使い方: node helpers/download-photo.mjs <storage_path> [destFileName]');
  process.exit(1);
}
const fileName = destFileName || path.basename(storagePath);
const dest = path.join(TMP_DIR, fileName);
const savedPath = await downloadStorageObject('photos', storagePath, dest);
printJson({ path: savedPath });
