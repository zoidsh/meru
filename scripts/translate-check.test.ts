import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
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

describe("check.ts", () => {
  test("has a clean fixture and a faults fixture for each locale with rules", async () => {
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

    expect(fixtures.sort()).toEqual(
      withRules.flatMap((locale) => [`${locale}-clean.po`, `${locale}-faults.po`]).sort(),
    );
  });

  for (const fixture of fixtures) {
    test(`finds exactly the faults planted in ${fixture}`, async () => {
      // A tag such as es-419 or pt-BR has a hyphen of its own.
      const locale = fixture.replace(/-(?:clean|faults)\.po$/u, "");

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
  });
});
