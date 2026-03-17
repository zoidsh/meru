import fs from "node:fs/promises";

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath, fs.constants.F_OK);

    return true;
  } catch {
    return false;
  }
}
