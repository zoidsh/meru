import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkCatalogs, readCatalog } from "../.claude/skills/translate/check";
import { LANGUAGES_DIR, loadSidecar } from "../.claude/skills/translate/rules";

/*
 * Lives here rather than beside the script because `bun test` never looks
 * inside a dot directory such as `.claude`. Each fixture marks a planted fault
 * with a `# fault: <rule>:<id>` translator comment, so a fixture without one
 * must come back clean.
 */

const FIXTURES_DIR = path.join(import.meta.dir, "../.claude/skills/translate/fixtures");

const FAULT_PREFIX = "fault: ";

const fixtures = (await readdir(FIXTURES_DIR)).filter((file) => file.endsWith(".po"));

function key(msgctxt: string | null, msgid: string, rule: string) {
  return `${msgctxt ?? ""}|${msgid}|${rule}`;
}

function localeOf(fixture: string) {
  return fixture.replace(/-(?:clean|faults)\.po$/u, "");
}

async function localesWithRules() {
  const locales = (await readdir(LANGUAGES_DIR))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));

  const withRules: string[] = [];

  for (const locale of locales) {
    const sidecar = await loadSidecar(locale);

    if (
      sidecar.platformWords.entries.length > 0 ||
      sidecar.banned.length > 0 ||
      sidecar.pinned.length > 0 ||
      sidecar.accessKeys !== null ||
      sidecar.families.length > 0
    ) {
      withRules.push(locale);
    }
  }

  return withRules;
}

describe("check.ts", () => {
  test("has a clean fixture and a faults fixture for each locale with rules", async () => {
    const expected = (await localesWithRules()).flatMap((locale) => [
      `${locale}-clean.po`,
      `${locale}-faults.po`,
    ]);

    expect(fixtures.sort()).toEqual(expected.sort());
  });

  for (const fixture of fixtures) {
    test(`finds exactly the faults planted in ${fixture}`, async () => {
      const locale = localeOf(fixture);

      const fixturePath = path.join(FIXTURES_DIR, fixture);

      const catalog = await readCatalog(locale, fixturePath);

      const planted = Object.entries(catalog).flatMap(
        ([id, entry]) =>
          (entry.extra as { translatorComments?: string[] }).translatorComments
            ?.filter((comment) => comment.startsWith(FAULT_PREFIX))
            .map((comment) =>
              key(entry.context ?? null, entry.message ?? id, comment.slice(FAULT_PREFIX.length)),
            ) ?? [],
      );

      const report = checkCatalogs(locale, await loadSidecar(locale), [
        { path: fixturePath, catalog },
      ]);

      const found = report.findings.map((finding) =>
        key(finding.msgctxt, finding.msgid, `${finding.rule}:${finding.id}`),
      );

      expect(found.sort()).toEqual(planted.sort());
    });
  }

  /*
   * Rules share ids, such as a language's five sound-name pins, so a planted
   * fault per id could leave all but one of them untested. Each banned and
   * pinned rule runs alone here and must catch a fault planted for its id.
   */
  for (const locale of new Set(fixtures.map(localeOf))) {
    test(`each banned and pinned rule of ${locale} catches a planted fault of its own`, async () => {
      const fixturePath = path.join(FIXTURES_DIR, `${locale}-faults.po`);

      const catalog = await readCatalog(locale, fixturePath);

      const plantedFor = (entry: (typeof catalog)[string], fault: string) =>
        (entry.extra as { translatorComments?: string[] }).translatorComments?.includes(
          `${FAULT_PREFIX}${fault}`,
        ) ?? false;

      const sidecar = await loadSidecar(locale);

      const rules = [
        ...sidecar.banned.map((rule, index) => ({ kind: "banned" as const, rule, index })),
        ...sidecar.pinned.map((rule, index) => ({ kind: "pinned" as const, rule, index })),
      ];

      const untested = rules.flatMap(({ kind, rule, index }) => {
        const report = checkCatalogs(
          locale,
          {
            ...sidecar,
            platformWords: { ...sidecar.platformWords, entries: [] },
            banned: kind === "banned" ? [rule] : [],
            pinned: kind === "pinned" ? [rule] : [],
            accessKeys: null,
            families: [],
          },
          [{ path: fixturePath, catalog }],
        );

        const caught = report.findings.some(
          (finding) =>
            finding.rule === kind &&
            Object.values(catalog).some(
              (entry) =>
                (entry.context ?? null) === finding.msgctxt &&
                entry.message === finding.msgid &&
                plantedFor(entry, `${kind}:${rule.id}`),
            ),
        );

        return caught ? [] : [`${kind}[${index}] ${rule.id}`];
      });

      expect(untested).toEqual([]);
    });
  }

  describe("exit code", () => {
    const ROOT = path.join(import.meta.dir, "..");

    function exitCodeOf(...args: string[]) {
      return Bun.spawnSync(["bun", ".claude/skills/translate/check.ts", ...args], {
        cwd: ROOT,
        stdout: "ignore",
        stderr: "ignore",
      }).exitCode;
    }

    test("is 0 for a clean catalog", () => {
      expect(
        exitCodeOf("--locale", "de", "--catalog", path.join(FIXTURES_DIR, "de-clean.po")),
      ).toBe(0);
    });

    test("is 1 for wrong findings", () => {
      expect(
        exitCodeOf("--locale", "de", "--catalog", path.join(FIXTURES_DIR, "de-faults.po")),
      ).toBe(1);
    });

    test("is 2 when a catalog is missing", () => {
      expect(exitCodeOf("--locale", "de", "--catalog", path.join(FIXTURES_DIR, "missing.po"))).toBe(
        2,
      );
    });

    test("is 2 for a locale without a sidecar", () => {
      expect(
        exitCodeOf("--locale", "xx", "--catalog", path.join(FIXTURES_DIR, "de-clean.po")),
      ).toBe(2);
    });

    test("is 2 without a locale", () => {
      expect(exitCodeOf()).toBe(2);
    });

    test("is 0 for --help", () => {
      expect(exitCodeOf("--help")).toBe(0);
    });

    test("is 1 with --strict for a finding that isn't wrong, and 0 without", async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "translate-check-"));

      const catalogPath = path.join(dir, "de.po");

      await Bun.write(
        catalogPath,
        'msgid ""\nmsgstr ""\n"Language: de\\n"\n\nmsgid "Couldn\'t add the account."\nmsgstr "Das Konto konnte leider nicht hinzugefügt werden."\n',
      );

      expect(exitCodeOf("--locale", "de", "--catalog", catalogPath)).toBe(0);
      expect(exitCodeOf("--locale", "de", "--catalog", catalogPath, "--strict")).toBe(1);
    });

    test("is 2 for --shipped with a locale", () => {
      expect(exitCodeOf("--shipped", "--locale", "de")).toBe(2);
    });
  });
});
