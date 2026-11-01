import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parse } from "../.claude/skills/translate/collect";
import { countWords, parseEntryFile, scoreLocale } from "../.claude/skills/translate/mqm";

/*
 * Lives here rather than beside the script because `bun test` never looks
 * inside a dot directory such as `.claude`. The fixture catalogs hold 109
 * source words, so one minor error passes at 99.08 and two fail at 98.17.
 */

const FIXTURES_DIR = path.join(import.meta.dir, "../.claude/skills/translate/fixtures/mqm");

const fixture = (name: string) => Bun.file(path.join(FIXTURES_DIR, name));

async function catalogs() {
  return Promise.all(
    ["app", "preload-gmail"].map(async (name) => ({
      name,
      catalog: await parse(await fixture(`${name}.po`).text(), "de", "en", `${name}.po`),
    })),
  );
}

async function score(findings: string, { partial = false } = {}) {
  return scoreLocale({
    locale: "de",
    catalogs: await catalogs(),
    findings: await fixture(findings).json(),
    entries: partial ? parseEntryFile(await fixture("de.txt").text()) : undefined,
  });
}

describe("countWords", () => {
  test("counts the whitespace tokens of plain English", () => {
    expect(countWords("Move to Trash")).toBe(3);
    expect(countWords("Beta releases won't break.")).toBe(4);
  });

  test("counts each plural or select branch, and none of the ICU syntax", () => {
    expect(countWords("{count, plural, one {# unread email} other {# unread emails}}")).toBe(6);
    expect(countWords("{action, select, click {On click} other {Button}}")).toBe(3);
    expect(countWords("{count, plural, =0 {No email} other {# emails}}")).toBe(4);
  });

  test("counts a placeholder as one word and a tag as none", () => {
    expect(countWords("Quit {appName}")).toBe(2);
    expect(countWords("Add <0>{entry}</0> on its own line, then save.")).toBe(8);
    expect(countWords("<0>Learn more</0>")).toBe(2);
  });
});

describe("parseEntryFile", () => {
  test("reads each entry's catalog, msgctxt and msgid", async () => {
    expect(parseEntryFile(await fixture("de.txt").text())).toEqual([
      { catalog: "app", msgctxt: "macOS", msgid: "Quit {appName}" },
      {
        catalog: "app",
        msgctxt: null,
        msgid: "{action, select, click {On click} other {Button}}",
      },
      { catalog: "preload-gmail", msgctxt: null, msgid: "Move to Trash" },
    ]);
  });
});

describe("scoreLocale", () => {
  test("a clean full run scores every live entry of both catalogs and passes", async () => {
    const { result, errors } = await score("clean.json");

    expect(errors).toEqual([]);
    expect(result).toMatchObject({
      partial: false,
      entries: 9,
      words: 109,
      penalty: 0,
      score: 100,
      passes: true,
    });
  });

  test("one minor error passes a full run", async () => {
    const { result } = await score("one-minor.json");

    expect(result?.counts).toEqual({ critical: 0, major: 0, minor: 1 });
    expect(result?.score).toBeCloseTo(100 * (1 - 1 / 109), 6);
    expect(result?.perThousand).toBeCloseTo(1000 / 109, 6);
    expect(result?.passes).toBe(true);
  });

  test("enough minor errors to score under 99 fail a full run", async () => {
    const { result } = await score("two-minors.json");

    expect(result?.penalty).toBe(2);
    expect(result?.score).toBeLessThan(99);
    expect(result?.passes).toBe(false);
  });

  test("one major error fails a full run", async () => {
    const { result } = await score("one-major.json");

    expect(result?.counts.major).toBe(1);
    expect(result?.penalty).toBe(5);
    expect(result?.passes).toBe(false);
  });

  test("leaves a dismissed finding out of the score and the gate, and lists it", async () => {
    const { result } = await score("dismissed-major.json");

    expect(result?.counts).toEqual({ critical: 0, major: 0, minor: 1 });
    expect(result?.penalty).toBe(1);
    expect(result?.passes).toBe(true);
    expect(result?.findings.map(({ msgid }) => msgid)).toEqual([
      "{action, select, click {On click} other {Button}}",
    ]);
    expect(result?.dismissed.map(({ msgid, dismissed }) => [msgid, dismissed])).toEqual([
      ["Quit {appName}", "Planted: packages/app/menu.ts shows the translation is right."],
    ]);
  });

  test("refuses a dismissal without a reason", async () => {
    const { result, errors } = scoreLocale({
      locale: "de",
      catalogs: await catalogs(),
      findings: [
        {
          catalog: "app",
          msgctxt: null,
          msgid: "Settings",
          msgstr: "Einstellungen",
          category: "terminology",
          severity: "major",
          reason: "",
          correction: "Optionen",
          dismissed: " ",
        },
      ],
    });

    expect(result).toBeUndefined();
    expect(errors).toEqual(["Item 0 is dismissed without a reason."]);
  });

  test("a partial run scores only the listed entries and ignores the score", async () => {
    const { result } = await score("two-minors.json", { partial: true });

    expect(result).toMatchObject({ partial: true, entries: 3, words: 8, penalty: 2 });
    expect(result?.score).toBe(75);
    expect(result?.passes).toBe(true);
  });

  test("one major error fails a partial run", async () => {
    const { result } = await score("one-major.json", { partial: true });

    expect(result?.passes).toBe(false);
  });

  test("refuses a finding on an entry the run didn't assess", async () => {
    const { result, errors } = scoreLocale({
      locale: "de",
      catalogs: await catalogs(),
      findings: [
        {
          catalog: "app",
          msgctxt: null,
          msgid: "Settings",
          msgstr: "Einstellungen",
          category: "terminology",
          severity: "minor",
          reason: "",
          correction: "Optionen",
        },
      ],
      entries: parseEntryFile(await fixture("de.txt").text()),
    });

    expect(result).toBeUndefined();
    expect(errors).toEqual([`A finding names app: "Settings", which this run didn't assess.`]);
  });

  test("refuses a finding with an unknown severity or category", async () => {
    const { result, errors } = scoreLocale({
      locale: "de",
      catalogs: await catalogs(),
      findings: [
        {
          catalog: "app",
          msgctxt: null,
          msgid: "Settings",
          msgstr: "Einstellungen",
          category: "wording",
          severity: "wrong",
          reason: "",
          correction: "",
        },
      ],
    });

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(2);
  });

  test("warns when a finding quotes a translation the catalog no longer holds", async () => {
    const { result } = scoreLocale({
      locale: "de",
      catalogs: await catalogs(),
      findings: [
        {
          catalog: "app",
          msgctxt: null,
          msgid: "Settings",
          msgstr: "Optionen",
          category: "terminology",
          severity: "minor",
          reason: "",
          correction: "Einstellungen",
        },
      ],
    });

    expect(result?.warnings).toHaveLength(1);
  });
});
