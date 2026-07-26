import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeVaultFileAtomic(fullPath: string, content: string): Promise<void> {
  const dir = path.dirname(fullPath);
  const tmpPath = path.join(dir, `.${path.basename(fullPath)}.tmp-${randomUUID()}`);
  await writeFile(tmpPath, content, "utf8");
  try {
    await rename(tmpPath, fullPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}
