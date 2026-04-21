import { platform } from "@electron-toolkit/utils";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log } from "./log";

const ASSERTIONS_PATH = join(homedir(), "Library", "DoNotDisturb", "DB", "Assertions.json");

const CACHE_TTL_MS = 5_000;

let cachedDoNotDisturbActive = false;
let cachedAt = 0;
let hasWarnedOnParseFailure = false;

function readDoNotDisturbState() {
  const raw = readFileSync(ASSERTIONS_PATH, "utf8");
  const parsed = JSON.parse(raw);

  const storeAssertionRecords = parsed?.data?.[0]?.storeAssertionRecords;

  if (!Array.isArray(storeAssertionRecords)) {
    return false;
  }

  return storeAssertionRecords.some(
    (record) => typeof record?.assertionDetails?.assertionDetailsModeIdentifier === "string",
  );
}

export function isMacOSDoNotDisturbActive() {
  if (!platform.isMacOS) {
    return false;
  }

  const now = Date.now();

  if (now - cachedAt < CACHE_TTL_MS) {
    return cachedDoNotDisturbActive;
  }

  try {
    cachedDoNotDisturbActive = readDoNotDisturbState();
  } catch (error) {
    // File missing (no Focus ever configured) is expected — stay silent.
    // Unexpected parse/schema errors are worth a one-time warning, but we
    // always fail open so a future schema change never silences sounds.
    if (
      !hasWarnedOnParseFailure &&
      error instanceof Error &&
      !(error as NodeJS.ErrnoException).code
    ) {
      hasWarnedOnParseFailure = true;

      log.warn("Failed to read macOS Do Not Disturb state:", error);
    }

    cachedDoNotDisturbActive = false;
  }

  cachedAt = now;

  return cachedDoNotDisturbActive;
}
