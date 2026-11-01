import { describe, expect, test } from "bun:test";
import path from "node:path";
import { checkCatalogs, readCatalog } from "../.claude/skills/translate/check";
import { dumpCatalogs } from "../.claude/skills/translate/collect";
import type { MqmFinding, MqmSeverity } from "../.claude/skills/translate/mqm";
import {
  checkFlags,
  checkInput,
  type Expectation,
  formatRange,
  loadRegressionSet,
  type RegressionSet,
  regressionRange,
  scoreRegression,
  scoreReview,
} from "../.claude/skills/translate/regression";
import { loadSidecar } from "../.claude/skills/translate/rules";

/*
 * Lives here rather than beside the script because `bun test` never looks
 * inside a dot directory such as `.claude`.
 */

const LOCALES = ["de", "ja", "fr"];

const CHECK_PREFIX = "check: ";

const REGRESSION_DIR = path.join(import.meta.dir, "../.claude/skills/translate/regression");

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

    test(`${locale} holds at least 8 hard entries, a sanity floor rather than a quality bar, which grows as runs make real errors worth keeping`, () => {
      expect(
        (sets[locale] as RegressionSet).expectations.filter(({ hard }) => hard).length,
      ).toBeGreaterThanOrEqual(8);
    });

    /*
     * A known-bad entry marks each check.ts finding its planted error gives as
     * `# check: <rule>:<id>`, so a finding nothing planted, such as a no-break
     * space lost when the entry was copied, fails here rather than handing the
     * reviewers a second error to find.
     */
    test(`${locale}'s check.ts findings are exactly the ones its known-bad entries plant`, async () => {
      const file = path.join(REGRESSION_DIR, `${locale}.po`);

      const catalog = await readCatalog(locale, file);

      const planted = Object.entries(catalog).flatMap(([id, entry]) => {
        const comments =
          (entry.extra as { translatorComments?: string[] }).translatorComments ?? [];

        return comments
          .filter((comment) => comment.startsWith(CHECK_PREFIX))
          .map((comment) => `${entry.message ?? id}: ${comment.slice(CHECK_PREFIX.length)}`);
      });

      const report = checkCatalogs(locale, await loadSidecar(locale), [{ path: file, catalog }]);

      expect(
        report.findings.map(({ msgid, rule, id }) => `${msgid}: ${rule}:${id}`).sort(),
      ).toEqual(planted.sort());
    });

    /*
     * The test above holds every check.ts finding to a `# check:` mark, so a
     * hard entry without one is an error no rule catches.
     */
    test(`${locale}'s hard entries are ones no check.ts rule catches`, async () => {
      const catalog = await readCatalog(locale, path.join(REGRESSION_DIR, `${locale}.po`));

      expect(
        Object.entries(catalog).flatMap(([id, entry]) => {
          const comments =
            (entry.extra as { translatorComments?: string[] }).translatorComments ?? [];

          return comments.includes("hard") &&
            comments.some((comment) => comment.startsWith(CHECK_PREFIX))
            ? [entry.message ?? id]
            : [];
        }),
      ).toEqual([]);
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

  test("counts recall per expected severity, a catch by any run counting", () => {
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

    expect(combined?.recall.critical).toEqual({
      expected: critical.length,
      caught: critical.length,
    });
    expect(combined?.recall.major.caught).toBe(0);
    expect(combined?.missed).toHaveLength(knownBad.length - critical.length);
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
      runs: [[finding(de, major, "minor")], [finding(de, major, "minor")], []].map(
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

  test("a finding any run files on an accepted entry is a false positive, and each run shows its own", () => {
    const { combined, runs } = scoreRegression({
      locale: "de",
      set: de,
      runs: [
        { name: "1", findings: [finding(de, accepted, "minor")] },
        { name: "2", findings: [finding(de, accepted, "major")] },
        { name: "3", findings: [] },
      ],
    });

    expect(combined?.falsePositives.map(({ msgid, severity }) => [msgid, severity])).toEqual([
      ["Persist zoom", "major"],
    ]);
    expect(runs.map(({ falsePositives }) => falsePositives.length)).toEqual([1, 1, 0]);
    expect(combined?.accepted).toBe(de.accepted);
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

  test("shows how many runs made each catch and filed each false positive", () => {
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
    expect(agreement?.falsePositivesByRuns).toEqual([de.accepted - 1, 1, 0, 0]);
  });
});

describe("regressionRange", () => {
  function measurement(findings: MqmFinding[]) {
    const { combined } = scoreRegression({
      locale: "de",
      set: de,
      runs: [findings, [], []].map((run, index) => ({ name: String(index + 1), findings: run })),
    });

    if (!combined) {
      throw new Error("The planted findings score.");
    }

    return combined;
  }

  test("reports each measurement and the range between them", () => {
    const all = catchAll();

    const first = measurement(all);

    const second = measurement([...all.slice(3), finding(de, accepted, "minor")]);

    const range = regressionRange([first, second]);

    expect(range.total).toEqual({
      min: knownBad.length - 3,
      max: knownBad.length,
      of: knownBad.length,
    });
    expect(range.falsePositives).toEqual({ min: 0, max: 1, of: de.accepted });

    const table = formatRange("de", [first, second]);

    expect(table).toContain(`| Range |`);
    expect(table).toContain(`${knownBad.length - 3}–${knownBad.length}/${knownBad.length}`);
    expect(table).not.toContain("One measurement only");
  });

  test("labels a lone measurement as single", () => {
    const only = measurement(catchAll());

    expect(regressionRange([only]).total).toEqual({
      min: knownBad.length,
      max: knownBad.length,
      of: knownBad.length,
    });
    expect(formatRange("de", [only])).toContain("One measurement only");
  });
});

describe("scoreReview", () => {
  const review = (entry: Pick<Expectation, "catalog" | "msgctxt" | "msgid">, severity: string) => ({
    catalog: entry.catalog,
    msgctxt: entry.msgctxt,
    msgid: entry.msgid,
    msgstr: msgstrOf(de, entry),
    severity,
    reason: "Planted.",
    suggestion: "Planted.",
  });

  const serious = knownBad.filter(({ severity }) => severity !== "minor");

  test("any finding on a known-bad entry catches it, whatever its kind, and one on an accepted entry is a false positive", () => {
    const { result, errors } = scoreReview(
      de,
      [
        ...serious.map((expectation) => review(expectation, "wrong")),
        ...knownBad
          .filter(({ severity }) => severity === "minor")
          .map((expectation) => review(expectation, "improve")),
        review(accepted, "improve"),
      ],
      [],
    );

    expect(errors).toEqual([]);
    expect(result?.reviewer.total).toEqual({ expected: knownBad.length, caught: knownBad.length });
    expect(result?.reviewer.categoryMatches).toBeUndefined();
    expect(result?.reviewer.falsePositives.map(({ msgid, kind }) => [msgid, kind])).toEqual([
      ["Persist zoom", "reviewer improve"],
    ]);
    expect(result?.breaches).toEqual({ caught: serious.length, asWrong: serious.length });
  });

  test("a critical or major entry caught only as improve isn't re-reviewed", () => {
    const { result } = scoreReview(
      de,
      serious.map((expectation) => review(expectation, "improve")),
      [],
    );

    expect(result?.breaches).toEqual({ caught: serious.length, asWrong: 0 });
  });

  test("adds every check.ts finding to the reviewer's, as step 4 sends them to the translator", async () => {
    const check = checkFlags(checkCatalogs("de", await loadSidecar("de"), checkInput(de)));

    const { result } = scoreReview(de, [], check);

    expect(check.length).toBeGreaterThan(0);
    expect(result?.reviewer.total.caught).toBe(0);
    expect(result?.withCheck.total.caught).toBeGreaterThan(0);
    expect(result?.withCheck.total.caught).toBeLessThan(knownBad.length);
  });

  test("refuses a finding on an entry the set lacks, or of an unknown kind", () => {
    const { result, errors } = scoreReview(
      de,
      [
        { ...review(accepted, "improve"), msgid: "Nothing like this" },
        review(accepted, "doubtful"),
      ],
      [],
    );

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      `A finding names app: "Nothing like this", which the set doesn't hold.`,
      `Item 1 has severity "doubtful"; use wrong, improve.`,
    ]);
  });
});
