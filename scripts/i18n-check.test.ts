import { describe, expect, test } from "bun:test";
import { findCatalogProblems, parseCatalog } from "./i18n-check";

const CATALOG_PATH = "packages/shared/i18n/locales/fixture.po";

/**
 * A catalog as `lingui extract` writes one, built from its entries so that each
 * check is held against the same PO parse the run does.
 */
async function problemsIn(locale: string, entries: string) {
  const catalog = await parseCatalog(
    `msgid ""
msgstr ""
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=utf-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"X-Generator: @lingui/cli\\n"
"Language: ${locale}\\n"

${entries}
`,
    { locale, sourceLocale: "en", filename: CATALOG_PATH },
  );

  return findCatalogProblems(locale, catalog, CATALOG_PATH);
}

function kinds(problems: Awaited<ReturnType<typeof problemsIn>>) {
  return problems.map((problem) => problem.kind);
}

describe("findCatalogProblems", () => {
  test("passes a catalog with nothing wrong with it", async () => {
    expect(
      await problemsIn(
        "de",
        `#: packages/app/menu.ts:1
msgid "Settings"
msgstr "Einstellungen"`,
      ),
    ).toEqual([]);
  });

  test("names an untranslated entry", async () => {
    const problems = await problemsIn(
      "de",
      `#: packages/app/menu.ts:1
msgid "Settings"
msgstr ""`,
    );

    expect(kinds(problems)).toEqual(["untranslated"]);
    expect(problems[0]).toMatchObject({
      source: "Settings",
      origin: "packages/app/menu.ts:1",
    });
  });

  test("names a fuzzy entry", async () => {
    expect(
      kinds(
        await problemsIn(
          "de",
          `#: packages/app/menu.ts:1
#, fuzzy
msgid "Settings"
msgstr "Einstellungen"`,
        ),
      ),
    ).toEqual(["fuzzy"]);
  });

  test("names an obsolete entry", async () => {
    expect(kinds(await problemsIn("de", `#~ msgid "Gone"\n#~ msgstr "Weg"`))).toEqual(["obsolete"]);
  });

  test("names a dropped and an invented placeholder", async () => {
    const problems = await problemsIn(
      "de",
      `#: packages/app/dialogs.ts:1
msgid "Open {appLabel} in this {targetLabel}?"
msgstr "{appName} in diesem Tab öffnen?"`,
    );

    expect(kinds(problems).sort()).toEqual([
      "placeholder dropped",
      "placeholder dropped",
      "placeholder invented",
    ]);
    expect(problems.map((problem) => problem.detail)).toContain(
      "{appLabel} is missing from the translation",
    );
    expect(problems.map((problem) => problem.detail)).toContain("{appName} is not in the source");
  });

  test("passes a translation that reorders its placeholders", async () => {
    expect(
      await problemsIn(
        "de",
        `#: packages/app/dialogs.ts:1
msgid "Open {appLabel} in this {targetLabel}?"
msgstr "In diesem {targetLabel} {appLabel} öffnen?"`,
      ),
    ).toEqual([]);
  });

  test("names a dropped and a renamed tag", async () => {
    const dropped = await problemsIn(
      "de",
      `#: packages/renderer/routes/settings/workspace-apps.tsx:1
msgid "Hold <0>Shift</0> to open a link in a tab"
msgstr "Shift halten, um einen Link in einem Tab zu öffnen"`,
    );

    expect(kinds(dropped)).toEqual(["tag dropped"]);
    expect(dropped[0]?.detail).toBe("<0> appears 2 time(s) in the source and 0 in the translation");

    const renamed = await problemsIn(
      "de",
      `#: packages/renderer/routes/settings/workspace-apps.tsx:1
msgid "Hold <0>Shift</0> to open a link in a tab"
msgstr "<1>Shift</1> halten, um einen Link in einem Tab zu öffnen"`,
    );

    expect(kinds(renamed).sort()).toEqual(["tag dropped", "tag invented"]);
  });

  test("passes a translation that keeps its tag", async () => {
    expect(
      await problemsIn(
        "de",
        `#: packages/renderer/routes/settings/workspace-apps.tsx:1
msgid "Hold <0>Shift</0> to open a link in a tab"
msgstr "<0>Shift</0> halten, um einen Link in einem Tab zu öffnen"`,
      ),
    ).toEqual([]);
  });

  test("names a plural missing a category Polish selects", async () => {
    const problems = await problemsIn(
      "pl",
      `#: packages/renderer/routes/settings/license.tsx:1
msgid "{daysLeft, plural, one {# day left} other {# days left}}"
msgstr "{daysLeft, plural, one {Został # dzień} other {Zostało # dni}}"`,
    );

    expect(kinds(problems)).toEqual(["plural category missing"]);
    expect(problems[0]?.detail).toBe("{daysLeft} needs one, few, many, other; missing few, many");
  });

  test("passes a Polish plural with every category it selects", async () => {
    expect(
      await problemsIn(
        "pl",
        `#: packages/renderer/routes/settings/license.tsx:1
msgid "{daysLeft, plural, one {# day left} other {# days left}}"
msgstr "{daysLeft, plural, one {Został # dzień} few {Zostały # dni} many {Zostało # dni} other {Zostało # dnia}}"`,
      ),
    ).toEqual([]);
  });

  test("names a plural category the locale never selects", async () => {
    const problems = await problemsIn(
      "ja",
      `#: packages/renderer/routes/settings/license.tsx:1
msgid "{daysLeft, plural, one {# day left} other {# days left}}"
msgstr "{daysLeft, plural, one {残り#日} other {残り#日}}"`,
    );

    expect(kinds(problems)).toEqual(["plural category unused"]);
    expect(problems[0]?.detail).toBe("one is never selected in ja");
  });

  test("names invalid ICU in a translation", async () => {
    expect(
      kinds(
        await problemsIn(
          "de",
          `#: packages/app/dialogs.ts:1
msgid "Open {appLabel}?"
msgstr "{appLabel öffnen?"`,
        ),
      ),
    ).toEqual(["invalid ICU"]);
  });
});
