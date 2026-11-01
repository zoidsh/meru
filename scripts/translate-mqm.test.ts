import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "../.claude/skills/translate/collect";
import {
  changedEntries,
  countWords,
  formatEntryList,
  parseEntryFile,
  type MqmFinding,
  type MqmSeverity,
  readRuns,
  resolveBase,
  scoreLocale,
  scoreRuns,
  uniqueEntries,
} from "../.claude/skills/translate/mqm";

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

describe("changedEntries", () => {
  test("lists each live entry whose translation is new or differs, and no other", async () => {
    const earlier = await catalogs();

    const [current, preloadGmail] = await catalogs();

    if (!current || !preloadGmail) {
      throw new Error("The fixtures hold two catalogs.");
    }

    const app = current.catalog;

    const settings = Object.values(app).find(({ message }) => message === "Settings");

    if (!settings) {
      throw new Error("The app fixture holds Settings.");
    }

    settings.translation = "Optionen";

    app["new-id"] = { message: "New", translation: "Neu" };

    app["empty-id"] = { message: "Empty", translation: "" };

    expect(changedEntries([current, preloadGmail], earlier)).toEqual([
      { catalog: "app", msgctxt: null, msgid: "Settings" },
      { catalog: "app", msgctxt: null, msgid: "New" },
    ]);
  });

  test("a partial run's list, written and read back, holds the entry file's and the changed entries once each", async () => {
    const listed = parseEntryFile(await fixture("de.txt").text());

    const entries = uniqueEntries([
      ...listed,
      { catalog: "app", msgctxt: null, msgid: "Settings" },
      { catalog: "preload-gmail", msgctxt: null, msgid: "Move to Trash" },
    ]);

    const [quit, action, trash] = listed;

    if (!quit || !action || !trash) {
      throw new Error("The entry file fixture holds three entries.");
    }

    expect(parseEntryFile(formatEntryList("de", entries))).toEqual([
      quit,
      action,
      { catalog: "app", msgctxt: null, msgid: "Settings" },
      trash,
    ]);
  });
});

describe("resolveBase", () => {
  test("compares against the merge base with beta without a base, and with the base given", () => {
    expect(resolveBase(undefined, (ref) => `merge base with ${ref}`)).toBe("merge base with beta");
    expect(resolveBase("origin/beta", () => "abc123")).toBe("abc123");
  });

  test("refuses a base with no merge base rather than fall back to HEAD", () => {
    expect(() => resolveBase("origin/missing", () => undefined)).toThrow(
      "--base origin/missing has no merge base with HEAD; fetch it or pass another ref.",
    );
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

function finding(
  msgid: string,
  severity: MqmSeverity,
  overrides: Partial<MqmFinding> = {},
): MqmFinding {
  const msgstr: Record<string, string> = {
    Settings: "Einstellungen",
    "Move to Trash": "In den Papierkorb verschieben",
    "Add <0>{entry}</0> on its own line, then save.":
      "Füge <0>{entry}</0> in einer eigenen Zeile hinzu und speichere dann.",
  };

  return {
    catalog: msgid === "Move to Trash" ? "preload-gmail" : "app",
    msgctxt: null,
    msgid,
    msgstr: msgstr[msgid] ?? "",
    category: "accuracy/mistranslation",
    severity,
    reason: "Planted.",
    correction: "Planted.",
    ...overrides,
  };
}

async function scoreThree(runs: MqmFinding[][], { partial = false } = {}) {
  return scoreRuns({
    locale: "de",
    catalogs: await catalogs(),
    runs: runs.map((findings, index) => ({ name: `de.mqm.${index + 1}.json`, findings })),
    entries: partial ? parseEntryFile(await fixture("de.txt").text()) : undefined,
  });
}

describe("scoreRuns", () => {
  test("a major only one of three runs reports is listed as single-run and passes the gate", async () => {
    const { result, errors } = await scoreThree([[finding("Settings", "major")], [], []]);

    expect(errors).toEqual([]);
    expect(result?.counts).toEqual({ critical: 0, major: 0, minor: 0 });
    expect(result?.findings).toEqual([]);
    expect(result?.single.map(({ msgid, severity }) => [msgid, severity])).toEqual([
      ["Settings", "major"],
    ]);
    expect(result?.passes).toBe(true);
  });

  test("a major two of three runs agree on fails the gate", async () => {
    const { result } = await scoreThree([
      [finding("Settings", "major")],
      [finding("Settings", "major")],
      [],
    ]);

    expect(result?.counts).toEqual({ critical: 0, major: 1, minor: 0 });
    expect(result?.findings.map(({ msgid, agreement }) => [msgid, agreement])).toEqual([
      ["Settings", 2],
    ]);
    expect(result?.single).toEqual([]);
    expect(result?.passes).toBe(false);
  });

  test("an entry takes the median of the three runs' severities", async () => {
    const { result } = await scoreThree([
      [finding("Settings", "critical"), finding("Move to Trash", "major")],
      [finding("Settings", "major"), finding("Move to Trash", "minor")],
      [finding("Move to Trash", "minor")],
    ]);

    expect(result?.counts).toEqual({ critical: 0, major: 1, minor: 1 });
    expect(result?.findings.map(({ msgid, severity }) => [msgid, severity])).toEqual([
      ["Settings", "major"],
      ["Move to Trash", "minor"],
    ]);
    expect(result?.single.map(({ msgid, severity }) => [msgid, severity])).toEqual([
      ["Settings", "critical"],
      ["Move to Trash", "major"],
    ]);
  });

  test("an entry two runs flag at all counts as minor, even when one calls it major", async () => {
    const { result } = await scoreThree([
      [finding("Settings", "major")],
      [finding("Settings", "minor")],
      [],
    ]);

    expect(result?.counts).toEqual({ critical: 0, major: 0, minor: 1 });
    expect(result?.passes).toBe(true);
  });

  test("scores each run on its own and takes the median score", async () => {
    const { result } = await scoreThree([
      [finding("Settings", "minor"), finding("Move to Trash", "minor")],
      [],
      [finding("Settings", "major")],
    ]);

    expect(result?.runs.map(({ name, penalty }) => [name, penalty])).toEqual([
      ["de.mqm.1.json", 2],
      ["de.mqm.2.json", 0],
      ["de.mqm.3.json", 5],
    ]);
    expect(result?.penalty).toBe(2);
    expect(result?.score).toBeCloseTo(100 * (1 - 2 / 109), 6);
    expect(result?.passes).toBe(false);
  });

  test("a dismissal on an entry in one run's file leaves the entry out of every run", async () => {
    const { result } = await scoreThree([
      [finding("Settings", "major", { dismissed: "Planted: the code shows it right." })],
      [finding("Settings", "major")],
      [finding("Settings", "minor")],
    ]);

    expect(result?.counts).toEqual({ critical: 0, major: 0, minor: 0 });
    expect(result?.runs.map(({ penalty }) => penalty)).toEqual([0, 0, 0]);
    expect(result?.dismissed.map(({ msgid, dismissed }) => [msgid, dismissed])).toEqual([
      ["Settings", "Planted: the code shows it right."],
    ]);
    expect(result?.single).toEqual([]);
    expect(result?.passes).toBe(true);
  });

  test("one findings file scores as it always has", async () => {
    const findings = await fixture("dismissed-major.json").json();

    const single = scoreLocale({ locale: "de", catalogs: await catalogs(), findings });

    const { result } = scoreRuns({
      locale: "de",
      catalogs: await catalogs(),
      runs: [{ name: "de.mqm.json", findings }],
    });

    expect(result).toMatchObject({
      counts: single.result?.counts,
      penalty: single.result?.penalty,
      score: single.result?.score,
      passes: single.result?.passes,
      dismissed: single.result?.dismissed,
      single: [],
    });
  });

  test("names the run whose file is invalid", async () => {
    const { result, errors } = await scoreThree([
      [],
      [finding("Settings", "minor", { msgid: "Nothing like this" })],
      [],
    ]);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      `de.mqm.2.json: A finding names app: "Nothing like this", which this run didn't assess.`,
    ]);
  });

  test("a partial run gates on agreed majors alone, an entry with two errors in a run taking the higher", async () => {
    const quit = { msgctxt: "macOS", msgid: "Quit {appName}", msgstr: "{appName} beenden" };

    const { result } = await scoreThree(
      [
        [finding("Settings", "minor", quit), finding("Settings", "major", quit)],
        [finding("Settings", "minor", quit)],
        [],
      ],
      { partial: true },
    );

    expect(result).toMatchObject({ partial: true, counts: { critical: 0, major: 0, minor: 1 } });
    expect(result?.passes).toBe(true);
  });
});

describe("readRuns", () => {
  async function dirWith(files: string[]) {
    const dir = await mkdtemp(path.join(tmpdir(), "mqm-runs-"));

    await Promise.all(files.map((file) => Bun.write(path.join(dir, file), "[]")));

    return dir;
  }

  test("reads a round's run files in run order, and nothing else of the locale's", async () => {
    const dir = await dirWith([
      "de.mqm.10.json",
      "de.mqm.2.json",
      "de.mqm.1.json",
      "de.mqm.agreed.json",
      "de.round1.mqm.1.json",
      "ja.mqm.1.json",
    ]);

    expect((await readRuns(dir, "de")).map(({ name }) => name)).toEqual([
      "de.mqm.1.json",
      "de.mqm.2.json",
      "de.mqm.10.json",
    ]);
  });

  test("reads one run's file alone", async () => {
    const dir = await dirWith(["de.mqm.json", "de.mqm.agreed.json"]);

    expect(await readRuns(dir, "de")).toEqual([{ name: "de.mqm.json", findings: [] }]);
  });

  test("refuses a directory with both forms, or neither", async () => {
    await expect(readRuns(await dirWith(["de.mqm.json", "de.mqm.1.json"]), "de")).rejects.toThrow(
      "move one set aside",
    );
    await expect(readRuns(await dirWith([]), "de")).rejects.toThrow("holds no de.mqm.json");
  });
});
