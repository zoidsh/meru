/**
 * Decides which Electron release, if any, the `electron-upgrade` skill takes:
 * the newest stable release in the installed major, once it has been on npm
 * for the minimum age. A new major is never offered; it is Tim's call.
 *
 *   bun scripts/electron-upgrade.ts [--time <file>] [--current <version>] [--now <iso>] [--min-age <hours>]
 *
 * Without `--time` it reads `npm view electron time --json`, and without
 * `--current` the version `bun.lock` resolved. The target alone goes to
 * stdout with exit 0; nothing to take is exit 1 and an error exit 2, each with
 * its reason on stderr, so a caller can branch on the code alone.
 *
 * Age is npm publish time, not the GitHub release, because npm is what
 * `bun add` installs from and it can lag the release.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ms } from "@meru/shared/ms";

const DEFAULT_MIN_AGE_HOURS = 24;

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;

type Version = [major: number, minor: number, patch: number];

type Release = { version: string; parts: Version; publishedAt: Date };

export type Decision =
  | { kind: "upgrade"; target: string; newerMajor?: string }
  | { kind: "current"; newerMajor?: string }
  | { kind: "held"; young: Release; clearsAt: Date; olderEligible?: string; newerMajor?: string };

function parseVersion(version: string) {
  const match = STABLE.exec(version);

  if (!match) {
    throw new Error(`Not a stable Electron version: ${version}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])] as Version;
}

function compare(a: Version, b: Version) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Stable releases from npm's `time` map, which also holds `created`, `modified` and prereleases. */
function stableReleases(time: unknown) {
  if (typeof time !== "object" || time === null || Array.isArray(time)) {
    throw new Error("npm's publish times are not an object of version to date");
  }

  return Object.entries(time).flatMap(([version, published]): Release[] => {
    if (!STABLE.test(version)) {
      return [];
    }

    const publishedAt = new Date(typeof published === "string" ? published : Number.NaN);

    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error(`Electron ${version} has no readable publish time: ${String(published)}`);
    }

    return [{ version, parts: parseVersion(version), publishedAt }];
  });
}

export function decide({
  time,
  current,
  now,
  minAgeHours = DEFAULT_MIN_AGE_HOURS,
}: {
  time: unknown;
  current: string;
  now: Date;
  minAgeHours?: number;
}): Decision {
  const currentParts = parseVersion(current);
  const releases = stableReleases(time).sort((a, b) => compare(b.parts, a.parts));

  // `--now` can lie in the past, where a major npm lists is not out yet.
  const newerMajor = releases.find(
    (release) => release.parts[0] > currentParts[0] && release.publishedAt <= now,
  )?.version;

  const candidates = releases.filter(
    (release) => release.parts[0] === currentParts[0] && compare(release.parts, currentParts) > 0,
  );

  const newest = candidates[0];

  if (newest === undefined) {
    return { kind: "current", newerMajor };
  }

  const clearsAtOf = (release: Release) =>
    new Date(release.publishedAt.getTime() + minAgeHours * ms("1h"));
  const clearsAt = clearsAtOf(newest);

  if (clearsAt <= now) {
    return { kind: "upgrade", target: newest.version, newerMajor };
  }

  // A release followed quickly by another suggests the first had a problem,
  // so an older candidate is not taken while the newest is still young.
  const olderEligible = candidates.find((release) => clearsAtOf(release) <= now)?.version;

  return { kind: "held", young: newest, clearsAt, olderEligible, newerMajor };
}

export function reasons(decision: Decision, current: string, minAgeHours = DEFAULT_MIN_AGE_HOURS) {
  const lines: string[] = [];

  if (decision.kind === "current") {
    lines.push(`Electron ${current} is the newest stable release in its major.`);
  } else if (decision.kind === "held") {
    lines.push(
      `Holding: Electron ${decision.young.version} was published at ${decision.young.publishedAt.toISOString()}, under ${minAgeHours} hours ago, and clears at ${decision.clearsAt.toISOString()}.`,
    );

    if (decision.olderEligible) {
      lines.push(
        `${decision.olderEligible} is old enough, but is not taken while a newer release is this young.`,
      );
    }
  }

  if (decision.newerMajor) {
    lines.push(
      `Electron ${decision.newerMajor} is a new major, which this never offers: ask Tim before taking it.`,
    );
  }

  return lines;
}

/** The version `bun.lock` resolved for `electron`. */
export function lockedElectron(lock: string) {
  const parsed = Bun.JSONC.parse(lock) as { packages?: Record<string, unknown> };
  const entry = parsed.packages?.electron;
  const resolved = Array.isArray(entry) ? entry[0] : undefined;
  const version = typeof resolved === "string" ? resolved.replace(/^electron@/, "") : undefined;

  if (version === undefined || !STABLE.test(version)) {
    throw new Error(`bun.lock resolves no stable electron: ${String(resolved)}`);
  }

  return version;
}

function npmTime() {
  const result = Bun.spawnSync(["npm", "view", "electron", "time", "--json"]);

  if (result.exitCode !== 0) {
    throw new Error(`npm view electron time failed: ${result.stderr.toString().trim()}`);
  }

  return parseTime(result.stdout.toString(), "npm");
}

function parseTime(json: string, source: string) {
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`Publish times from ${source} are not JSON: ${(error as Error).message}`);
  }
}

function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      time: { type: "string" },
      current: { type: "string" },
      now: { type: "string" },
      "min-age": { type: "string" },
    },
    strict: true,
  });

  const minAgeHours =
    values["min-age"] === undefined ? DEFAULT_MIN_AGE_HOURS : Number(values["min-age"]);

  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
    throw new Error(`--min-age takes a number of hours: ${values["min-age"]}`);
  }

  const now = values.now === undefined ? new Date() : new Date(values.now);

  if (Number.isNaN(now.getTime())) {
    throw new Error(`--now takes an ISO date: ${values.now}`);
  }

  const current =
    values.current ??
    lockedElectron(readFileSync(path.join(import.meta.dirname, "..", "bun.lock"), "utf8"));
  const time =
    values.time === undefined
      ? npmTime()
      : parseTime(readFileSync(values.time, "utf8"), values.time);

  const decision = decide({ time, current, now, minAgeHours });

  for (const line of reasons(decision, current, minAgeHours)) {
    console.error(line);
  }

  if (decision.kind !== "upgrade") {
    process.exit(1);
  }

  console.log(decision.target);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
