import { describe, expect, test } from "bun:test";
import { dumpCatalogs } from "../.claude/skills/translate/collect";
import type { MqmFinding, MqmSeverity } from "../.claude/skills/translate/mqm";
import {
  type Expectation,
  loadRegressionSet,
  type RegressionSet,
  scoreRegression,
} from "../.claude/skills/translate/regression";

/*
 * Lives here rather than beside the script because `bun test` never looks
 * inside a dot directory such as `.claude`.
 */

const LOCALES = ["de", "ja"];

const sets = Object.fromEntries(
  await Promise.all(LOCALES.map(async (locale) => [locale, await loadRegressionSet(locale)])),
) as Record<string, RegressionSet>;

function msgstrOf(
  set: RegressionSet,
  { catalog, msgctxt, msgid }: Pick<Expectation, "catalog" | "msgctxt" | "msgid">,
) {
  const entry = Object.values(
    set.catalogs.find(({ name }) => name === catalog)?.catalog ?? {},
  ).find((candidate) => (candidate.context ?? null) === msgctxt && candidate.message === msgid);

  return entry?.translation ?? "";
}

function finding(
  set: RegressionSet,
  entry: { catalog: string; msgctxt: string | null; msgid: string },
  severity: MqmSeverity,
  category: MqmFinding["category"] = "accuracy/mistranslation",
): MqmFinding {
  return {
    ...entry,
    msgstr: msgstrOf(set, entry),
    category,
    severity,
    reason: "Planted.",
    correction: "Planted.",
  };
}

const de = sets.de as RegressionSet;

const knownBad = de.expectations;

const catchAll = () =>
  knownBad.map((expectation) =>
    finding(de, expectation, expectation.severity, expectation.categories[0]),
  );

const accepted = { catalog: "app", msgctxt: null, msgid: "Persist zoom" };

describe("the regression sets", () => {
  for (const locale of LOCALES) {
    test(`${locale} holds about 30 accepted and 15 known-bad entries, covering every severity`, () => {
      const set = sets[locale] as RegressionSet;

      expect(set.accepted).toBeGreaterThanOrEqual(30);
      expect(set.expectations.length).toBeGreaterThanOrEqual(15);
      expect(new Set(set.expectations.map(({ severity }) => severity))).toEqual(
        new Set(["critical", "major", "minor"]),
      );
    });

    test(`${locale} holds about 10 hard entries, which no sidecar rule names`, () => {
      expect(
        (sets[locale] as RegressionSet).expectations.filter(({ hard }) => hard).length,
      ).toBeGreaterThanOrEqual(10);
    });

    test(`${locale}'s dump, which the reviewers read, holds none of the answers`, () => {
      const { text } = dumpCatalogs(locale, (sets[locale] as RegressionSet).catalogs);

      expect(text).not.toMatch(/expect:|planted|few-shot|real:|# hard/u);
    });
  }
});

describe("scoreRegression", () => {
  test("three runs catching every known-bad entry at its severity score full recall and no false positive", () => {
    const { combined, runs, errors } = scoreRegression({
      locale: "de",
      set: de,
      runs: [catchAll(), catchAll(), catchAll()].map((findings, index) => ({
        name: `de.mqm.${index + 1}.json`,
        findings,
      })),
    });

    expect(errors).toEqual([]);
    expect(combined?.total).toEqual({ expected: knownBad.length, caught: knownBad.length });
    expect(combined?.categoryMatches).toBe(knownBad.length);
    expect(combined?.falsePositives).toEqual([]);
    expect(combined?.missed).toEqual([]);
    expect(runs.map(({ total }) => total.caught)).toEqual([
      knownBad.length,
      knownBad.length,
      knownBad.length,
    ]);
  });

  test("counts recall per expected severity under the two-of-three rule", () => {
    const critical = knownBad.filter(({ severity }) => severity === "critical");

    const [first, ...others] = critical;

    if (!first) {
      throw new Error("The de set holds a critical entry.");
    }

    const { combined, runs } = scoreRegression({
      locale: "de",
      set: de,
      runs: [
        { name: "1", findings: [finding(de, first, "critical")] },
        {
          name: "2",
          findings: [
            finding(de, first, "critical"),
            ...others.map((other) => finding(de, other, "critical")),
          ],
        },
        { name: "3", findings: [] },
      ],
    });

    expect(combined?.recall.critical).toEqual({ expected: critical.length, caught: 1 });
    expect(combined?.recall.major.caught).toBe(0);
    expect(combined?.missed).toHaveLength(knownBad.length - 1);
    expect(runs.map(({ recall }) => recall.critical.caught)).toEqual([1, critical.length, 0]);
  });

  test("a known-bad entry agreed below its expected severity is under-graded, not caught", () => {
    const major = knownBad.find(({ severity }) => severity === "major");

    if (!major) {
      throw new Error("The de set holds a major entry.");
    }

    const { combined } = scoreRegression({
      locale: "de",
      set: de,
      runs: [[finding(de, major, "minor")], [finding(de, major, "major")], []].map(
        (findings, index) => ({
          name: String(index + 1),
          findings,
        }),
      ),
    });

    expect(combined?.recall.major.caught).toBe(0);
    expect(
      combined?.underGraded.map(({ expectation, finding }) => [
        expectation.msgid,
        finding.severity,
      ]),
    ).toEqual([[major.msgid, "minor"]]);
  });

  test("a finding on an accepted entry is a false positive only when two runs agree, and each run shows its own", () => {
    const { combined, runs } = scoreRegression({
      locale: "de",
      set: de,
      runs: [
        { name: "1", findings: [finding(de, accepted, "minor")] },
        { name: "2", findings: [] },
        { name: "3", findings: [] },
      ],
    });

    expect(combined?.falsePositives).toEqual([]);
    expect(runs.map(({ falsePositives }) => falsePositives.length)).toEqual([1, 0, 0]);

    const agreed = scoreRegression({
      locale: "de",
      set: de,
      runs: [
        { name: "1", findings: [finding(de, accepted, "minor")] },
        { name: "2", findings: [finding(de, accepted, "major")] },
        { name: "3", findings: [] },
      ],
    });

    expect(agreed.combined?.falsePositives.map(({ msgid, severity }) => [msgid, severity])).toEqual(
      [["Persist zoom", "minor"]],
    );
    expect(agreed.combined?.accepted).toBe(de.accepted);
  });

  test("leaves the reviewer prompt's own examples out of the second recall", () => {
    const fewShot = knownBad.filter(({ fewShot }) => fewShot);

    const { combined } = scoreRegression({
      locale: "de",
      set: de,
      runs: [1, 2].map((run) => ({
        name: String(run),
        findings: fewShot.map((expectation) => finding(de, expectation, expectation.severity)),
      })),
    });

    expect(fewShot.length).toBeGreaterThan(0);
    expect(combined?.total.caught).toBe(fewShot.length);
    expect(combined?.withoutFewShot).toEqual({
      expected: knownBad.length - fewShot.length,
      caught: 0,
    });
  });

  test("passes on mqm.ts's errors for a findings file it can't score", () => {
    const { combined, errors } = scoreRegression({
      locale: "de",
      set: de,
      runs: [{ name: "de.mqm.1.json", findings: {} }],
    });

    expect(combined).toBeUndefined();
    expect(errors).toEqual(["de.mqm.1.json: The findings file must hold a JSON array."]);
  });

  test("counts the hard entries' recall on its own", () => {
    const hard = knownBad.filter((expectation) => expectation.hard);

    const { combined } = scoreRegression({
      locale: "de",
      set: de,
      runs: [1, 2, 3].map((run) => ({
        name: String(run),
        findings: hard.map((expectation) => finding(de, expectation, expectation.severity)),
      })),
    });

    expect(combined?.hard).toEqual({ expected: hard.length, caught: hard.length });
    expect(combined?.total.caught).toBe(hard.length);
  });

  test("shows what the two-of-three rule dropped, a lone catch and a lone false positive", () => {
    const [first, second] = knownBad;

    if (!first || !second) {
      throw new Error("The de set holds two known-bad entries.");
    }

    const { agreement } = scoreRegression({
      locale: "de",
      set: de,
      runs: [
        {
          name: "1",
          findings: [
            finding(de, first, first.severity),
            finding(de, second, second.severity),
            finding(de, accepted, "minor"),
          ],
        },
        { name: "2", findings: [finding(de, first, first.severity)] },
        { name: "3", findings: [finding(de, first, first.severity)] },
      ],
    });

    expect(agreement?.catchesByRuns).toEqual([knownBad.length - 2, 1, 0, 1]);
    expect(agreement?.droppedCatches.map(({ msgid }) => msgid)).toEqual([second.msgid]);
    expect(agreement?.droppedFalsePositives.map(({ msgid }) => msgid)).toEqual(["Persist zoom"]);
  });
});
