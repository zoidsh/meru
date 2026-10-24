import path from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { type CompiledMessage, compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { findCatalogProblems, parseCatalog } from "../../../scripts/i18n-check";
import { loadSidecar, type Severity, type Sidecar } from "./rules";

/*
 * Holds a locale's catalogs against its sidecar, `languages/<tag>.json`: banned
 * words, pinned terms, platform words, access keys and term families, plus the
 * placeholder, tag and plural checks of `scripts/i18n-check.ts`. Prints JSON on
 * stdout and a summary on stderr, never writes a catalog, and exits non-zero
 * only when a finding is `wrong`.
 */

type Catalog = Awaited<ReturnType<typeof parseCatalog>>;

type CatalogEntry = Catalog[string];

export type Rule = "banned" | "pinned" | "platform-word" | "access-key" | "family" | "catalog";

export type Finding = {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
  msgstr: string;
  rule: Rule;
  id: string;
  severity: Severity;
  reason: string;
  detail: string;
};

type Entry = {
  catalog: string;
  key: string;
  msgctxt: string | null;
  msgid: string;
  msgstr: string;
  origins: string[];
};

export type Report = {
  locale: string;
  catalogs: string[];
  platformWords: { expected: number; inCatalogs: number };
  counts: { byRule: Partial<Record<Rule, number>>; bySeverity: Partial<Record<Severity, number>> };
  findings: Finding[];
};

const MACOS = "macOS";

function toEntries(catalogPath: string, catalog: Catalog) {
  return Object.entries(catalog).flatMap(([key, entry]: [string, CatalogEntry]): Entry[] =>
    entry.obsolete || !entry.translation
      ? []
      : [
          {
            catalog: catalogPath,
            key,
            msgctxt: entry.context ?? null,
            msgid: entry.message ?? key,
            msgstr: entry.translation,
            origins: (entry.origin ?? []).map(([file]) => file),
          },
        ],
  );
}

function keyOf(msgctxt: string | null, msgid: string) {
  return `${msgctxt ?? ""}\u0004${msgid}`;
}

function appendText(tokens: CompiledMessage, parts: string[]) {
  for (const token of tokens) {
    if (typeof token === "string") {
      parts.push(token);

      continue;
    }

    const [name, , format] = token as [string, string | undefined, unknown];

    if (!format || typeof format !== "object") {
      parts.push(`{${name}}`);

      continue;
    }

    for (const choice of Object.values(format as Record<string, unknown>)) {
      if (Array.isArray(choice)) {
        parts.push("\n");

        appendText(choice as CompiledMessage, parts);
      }
    }
  }
}

/*
 * The words a reader sees, so a pattern never matches an ICU argument or
 * keyword. A placeholder stays as `{name}`, which spacing rules treat as Latin
 * text, and each select or plural branch starts a line of its own.
 */
function visibleText(msgstr: string) {
  try {
    const parts: string[] = [];

    appendText(compileMessageOrThrow(msgstr), parts);

    return parts.join("");
  } catch {
    return msgstr;
  }
}

const compiledPatterns = new Map<string, RegExp>();

/** Every rule runs against every entry, so each pattern compiles once. */
function regex(source: string, flags = "") {
  const cacheKey = `${flags}/${source}`;

  let compiled = compiledPatterns.get(cacheKey);

  if (!compiled) {
    compiled = new RegExp(source, `u${flags}`);

    compiledPatterns.set(cacheKey, compiled);
  }

  // A global pattern carries `lastIndex` between calls.
  compiled.lastIndex = 0;

  return compiled;
}

function matchesSelector(
  entry: Entry,
  selector: { msgid?: string; msgidPattern?: string; msgctxt?: string | null; origin?: string },
) {
  return (
    (selector.msgid === undefined || entry.msgid === selector.msgid) &&
    (selector.msgidPattern === undefined || regex(selector.msgidPattern, "i").test(entry.msgid)) &&
    (selector.msgctxt === undefined || entry.msgctxt === selector.msgctxt) &&
    (selector.origin === undefined ||
      entry.origins.some((origin) => origin.startsWith(selector.origin as string)))
  );
}

/** `&` before a character, or Japanese's `(&X)`, which the access-key rule checks. */
function withoutAccessKey(msgstr: string) {
  return msgstr.replace(/\(&[^)]\)/gu, "").replace(/&(?=\S)/gu, "");
}

function sourceAccessKey(msgid: string) {
  return /&(\S)/u.exec(msgid)?.[1];
}

function accessKeyProblem(entry: Entry, style: "inline" | "suffix") {
  const ampersands = entry.msgstr.split("&").length - 1;

  if (entry.msgctxt === MACOS) {
    return ampersands > 0 ? "macOS shows no access key; drop the &" : undefined;
  }

  const key = sourceAccessKey(entry.msgid);

  if (!key) {
    return ampersands > 0 ? "the English has no access key" : undefined;
  }

  if (style === "inline") {
    if (ampersands !== 1 || !/&[\p{L}\p{N}]/u.test(entry.msgstr) || /\(&.\)/u.test(entry.msgstr)) {
      return `needs one & inline, before a letter of the word (the English marks “${key}”)`;
    }

    return undefined;
  }

  const suffix = `(&${key.toUpperCase()})`;

  if (ampersands !== 1 || !/\(&.\)…?$/u.test(entry.msgstr) || !entry.msgstr.includes(suffix)) {
    return `needs ${suffix} after the word, before a trailing ellipsis`;
  }

  return undefined;
}

function isInCase(text: string, letterCase: "lower" | "capitalized") {
  return letterCase === "lower" ? text === text.toLowerCase() : /^\p{Lu}/u.test(text);
}

/** Every finding for one locale's catalogs against its sidecar. */
export function checkCatalogs(
  locale: string,
  sidecar: Sidecar,
  catalogs: { path: string; catalog: Catalog }[],
): Report {
  const findings: Finding[] = [];

  const entries = catalogs.flatMap(({ path: catalogPath, catalog }) =>
    toEntries(catalogPath, catalog),
  );

  const byKey = new Map(entries.map((entry) => [keyOf(entry.msgctxt, entry.msgid), entry]));

  const report = (
    entry: Entry,
    rule: Rule,
    found: { id: string; severity: Severity; reason: string; detail: string },
  ) => {
    findings.push({
      catalog: entry.catalog,
      msgctxt: entry.msgctxt,
      msgid: entry.msgid,
      msgstr: entry.msgstr,
      rule,
      ...found,
    });
  };

  for (const entry of entries) {
    const text = visibleText(entry.msgstr);

    for (const banned of sidecar.banned) {
      const allow = banned.allow;

      if (
        (entry.msgctxt !== null && allow?.contexts?.includes(entry.msgctxt)) ||
        allow?.msgids?.includes(entry.msgid) ||
        (allow?.msgidPattern !== undefined && regex(allow.msgidPattern, "i").test(entry.msgid))
      ) {
        continue;
      }

      const matches = [...text.matchAll(regex(banned.pattern, "g"))].map((match) => match[0]);

      if (matches.length > 0) {
        report(entry, "banned", {
          id: banned.id,
          severity: banned.severity,
          reason: banned.reason,
          detail: matches.map((match) => `“${match}”`).join(", "),
        });
      }
    }

    for (const pinned of sidecar.pinned) {
      if (matchesSelector(entry, pinned) && !regex(pinned.expect).test(text)) {
        report(entry, "pinned", {
          id: pinned.id,
          severity: pinned.severity,
          reason: pinned.reason,
          detail: `expected /${pinned.expect}/`,
        });
      }
    }

    if (sidecar.accessKeys) {
      const problem = accessKeyProblem(entry, sidecar.accessKeys.style);

      if (problem) {
        report(entry, "access-key", {
          id: sidecar.accessKeys.style,
          severity: sidecar.accessKeys.severity,
          reason: sidecar.accessKeys.reason,
          detail: problem,
        });
      }
    }
  }

  let platformEntriesFound = 0;

  for (const word of sidecar.platformWords.entries) {
    const entry = byKey.get(keyOf(word.msgctxt, word.msgid));

    if (!entry) {
      continue;
    }

    platformEntriesFound++;

    const text = withoutAccessKey(entry.msgstr);

    const isRight = "msgstr" in word ? text === word.msgstr : text.includes(word.contains);

    if (!isRight) {
      report(entry, "platform-word", {
        id: word.row,
        severity: sidecar.platformWords.severity,
        reason: sidecar.platformWords.reason,
        detail:
          "msgstr" in word
            ? `expected “${word.msgstr}”`
            : `expected the sentence to contain “${word.contains}”`,
      });
    }
  }

  for (const family of sidecar.families) {
    const deviations = new Map<Entry, string[]>();

    for (const group of family.groups) {
      for (const member of group.entries) {
        // A catalog from before the platform split shows its one entry everywhere.
        const entry =
          byKey.get(keyOf(member.msgctxt ?? null, member.msgid)) ??
          byKey.get(keyOf(null, member.msgid));

        if (entry && !isInCase(entry.msgstr, group.case)) {
          deviations.set(entry, [
            ...(deviations.get(entry) ?? []),
            `${group.name} wants ${group.case} case`,
          ]);
        }
      }
    }

    for (const [entry, problems] of deviations) {
      report(entry, "family", {
        id: family.id,
        severity: family.severity,
        reason: family.reason,
        detail: problems.join("; "),
      });
    }
  }

  for (const { path: catalogPath, catalog } of catalogs) {
    for (const problem of findCatalogProblems(locale, catalog, catalogPath)) {
      const entry = catalog[problem.id];

      findings.push({
        catalog: catalogPath,
        msgctxt: entry?.context ?? null,
        msgid: problem.source,
        msgstr: entry?.translation ?? "",
        rule: "catalog",
        id: problem.kind,
        severity: "wrong",
        reason: "Placeholders, tags and plurals must survive translation (scripts/i18n-check.ts).",
        detail: problem.detail,
      });
    }
  }

  const counts: Report["counts"] = { byRule: {}, bySeverity: {} };

  for (const finding of findings) {
    counts.byRule[finding.rule] = (counts.byRule[finding.rule] ?? 0) + 1;
    counts.bySeverity[finding.severity] = (counts.bySeverity[finding.severity] ?? 0) + 1;
  }

  return {
    locale,
    catalogs: catalogs.map(({ path: catalogPath }) => catalogPath),
    platformWords: {
      expected: sidecar.platformWords.entries.length,
      inCatalogs: platformEntriesFound,
    },
    counts,
    findings,
  };
}

export async function readCatalog(locale: string, catalogPath: string) {
  return parseCatalog(await Bun.file(catalogPath).text(), {
    locale,
    sourceLocale: "en",
    filename: catalogPath,
  });
}

function summarize(report: Report) {
  const lines = [
    `${report.locale}: ${report.findings.length} finding(s) in ${report.catalogs.join(", ")}`,
  ];

  const byRule = Object.entries(report.counts.byRule).map(([rule, count]) => `${rule} ${count}`);

  const bySeverity = Object.entries(report.counts.bySeverity).map(
    ([severity, count]) => `${severity} ${count}`,
  );

  if (byRule.length > 0) {
    lines.push(`  by rule: ${byRule.join(", ")}`, `  by severity: ${bySeverity.join(", ")}`);
  }

  lines.push(
    `  platform words: ${report.platformWords.inCatalogs} of ${report.platformWords.expected} entries are in these catalogs`,
  );

  return lines.join("\n");
}

async function run() {
  const { values } = parseArgs({
    options: {
      locale: { type: "string" },
      catalog: { type: "string", multiple: true },
    },
  });

  if (!values.locale) {
    console.error(
      "Usage: bun .claude/skills/translate/check.ts --locale <tag> [--catalog <path.po>]…",
    );

    process.exit(2);
  }

  const locale = values.locale;

  const config = getConfig();

  const catalogPaths =
    values.catalog ??
    config.catalogs.map((catalogConfig) =>
      path.relative(process.cwd(), `${catalogConfig.path.replace("{locale}", locale)}.po`),
    );

  const catalogs = await Promise.all(
    catalogPaths.map(async (catalogPath) => ({
      path: catalogPath,
      catalog: await readCatalog(locale, catalogPath),
    })),
  );

  const report = checkCatalogs(locale, await loadSidecar(locale), catalogs);

  console.log(JSON.stringify(report, null, 2));
  console.error(summarize(report));

  if (report.findings.some((finding) => finding.severity === "wrong")) {
    process.exit(1);
  }
}

// A run that could not check anything exits 2, so a caller never reads a crash as findings.
if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    console.error(`check.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
