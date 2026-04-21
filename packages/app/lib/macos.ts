import { platform } from "@electron-toolkit/utils";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log } from "./log";

const ASSERTIONS_PATH = join(homedir(), "Library", "DoNotDisturb", "DB", "Assertions.json");

const CACHE_TTL_MS = 5_000;

let cachedIsMacOSDoNotDisturbActive = false;
let cachedAt = 0;
let hasWarnedOnParseFailure = false;

function readDoNotDisturbState() {
  const assertionsFileContents = readFileSync(ASSERTIONS_PATH, "utf8");
  const assertionsData = JSON.parse(assertionsFileContents);

  const storeAssertionRecords = assertionsData?.data?.[0]?.storeAssertionRecords;

  if (!Array.isArray(storeAssertionRecords)) {
    return false;
  }

  return storeAssertionRecords.some(
    (assertionRecord) =>
      typeof assertionRecord?.assertionDetails?.assertionDetailsModeIdentifier === "string",
  );
}

export function isMacOSDoNotDisturbActive() {
  if (!platform.isMacOS) {
    return false;
  }

  const now = Date.now();

  if (now - cachedAt < CACHE_TTL_MS) {
    return cachedIsMacOSDoNotDisturbActive;
  }

  try {
    cachedIsMacOSDoNotDisturbActive = readDoNotDisturbState();
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

    cachedIsMacOSDoNotDisturbActive = false;
  }

  cachedAt = now;

  return cachedIsMacOSDoNotDisturbActive;
}
