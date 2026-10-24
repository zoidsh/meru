import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { checkCatalogs, readCatalog } from "../.claude/skills/translate/check";
import { loadSidecar } from "../.claude/skills/translate/rules";

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
  test("has a clean fixture and a faults fixture for each locale with rules", () => {
    expect(fixtures.sort()).toEqual(["de-clean.po", "de-faults.po", "ja-clean.po", "ja-faults.po"]);
  });

  for (const fixture of fixtures) {
    test(`finds exactly the faults planted in ${fixture}`, async () => {
      const locale = fixture.split("-")[0] as string;

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
});
