import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkCatalogs, pinMentions, readCatalog } from "../.claude/skills/translate/check";
import {
  LANGUAGES_DIR,
  loadSidecar,
  type PinExample,
  pinExamples,
  platformEntries,
  type Sidecar,
} from "../.claude/skills/translate/rules";
import { parseCatalog } from "./i18n-check";

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
      platformEntries(sidecar).length > 0 ||
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

/** A catalog of one entry, as a PO file would give it to `check.ts`. */
function exampleCatalog(locale: string, example: PinExample, msgstr: string) {
  const lines = [
    'msgid ""',
    'msgstr ""',
    `"Language: ${locale}\\n"`,
    "",
    ...(example.origin ? [`#: ${example.origin}`] : []),
    ...(example.msgctxt === null ? [] : [`msgctxt ${JSON.stringify(example.msgctxt)}`]),
    `msgid ${JSON.stringify(example.msgid)}`,
    `msgstr ${JSON.stringify(msgstr)}`,
    "",
  ];

  return parseCatalog(lines.join("\n"), { locale, sourceLocale: "en", filename: "example.po" });
}

/*
 * Each pin's example, run against every rule of the sidecar: its allowed
 * wording must pass them all, and its fault must be caught by the pin, so a
 * pin needs no entry in the fixtures.
 */
async function pinExampleProblems(locale: string, sidecar: Sidecar) {
  const problems: string[] = [];

  for (const example of pinExamples(sidecar)) {
    const findingsFor = async (msgstr: string) =>
      checkCatalogs(locale, sidecar, [
        { path: "example.po", catalog: await exampleCatalog(locale, example, msgstr) },
      ]).findings.map((finding) => `${finding.rule}:${finding.id}`);

    if (example.clean !== undefined) {
      const found = await findingsFor(example.clean);

      if (found.length > 0) {
        problems.push(
          `${example.id}: the allowed “${example.clean}” has findings ${found.join(", ")}`,
        );
      }
    }

    if (!(await findingsFor(example.fault)).includes(`pinned:${example.id}`)) {
      problems.push(`${example.id}: the fault “${example.fault}” is not caught`);
    }
  }

  return problems;
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
   * Every rule id is a sidecar's own, so a fixture that finds exactly its
   * planted faults has caught each rule that has a mark; this keeps any ban
   * from having none. A pin's fault is its own example, below.
   */
  for (const locale of new Set(fixtures.map(localeOf))) {
    test(`each pinned rule of ${locale} allows its example's wording and catches its fault`, async () => {
      expect(await pinExampleProblems(locale, await loadSidecar(locale))).toEqual([]);
    });

    test(`each banned rule of ${locale} has a planted fault`, async () => {
      const catalog = await readCatalog(locale, path.join(FIXTURES_DIR, `${locale}-faults.po`));

      const planted = new Set(
        Object.values(catalog).flatMap(
          (entry) =>
            (entry.extra as { translatorComments?: string[] }).translatorComments
              ?.filter((comment) => comment.startsWith(FAULT_PREFIX))
              .map((comment) => comment.slice(FAULT_PREFIX.length)) ?? [],
        ),
      );

      const sidecar = await loadSidecar(locale);

      const unplanted = sidecar.banned
        .map((rule) => `banned:${rule.id}`)
        .filter((fault) => !planted.has(fault));

      expect(unplanted).toEqual([]);
    });
  }

  async function withSettingsExample(change: Partial<Sidecar["pinned"][number]["example"]>) {
    const sidecar = await loadSidecar("fr");

    const settings = sidecar.pinned.find((rule) => rule.id === "settings");

    if (!settings) {
      throw new Error("fr.json has no settings pin");
    }

    return {
      ...sidecar,
      pinned: [{ ...settings, example: { ...settings.example, ...change } }],
    };
  }

  test("a pin whose recorded fault its expect allows is caught", async () => {
    expect(
      await pinExampleProblems("fr", await withSettingsExample({ fault: "Paramètres" })),
    ).toEqual(["settings: the fault “Paramètres” is not caught"]);
  });

  test("a pin whose allowed wording another rule rejects is caught", async () => {
    expect(
      await pinExampleProblems("fr", await withSettingsExample({ clean: "Paramètres..." })),
    ).toEqual([
      "settings: the allowed “Paramètres...” has findings banned:ellipsis, pinned:settings",
    ]);
  });

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

    test("is 2 for --mentions with --shipped or without a locale", () => {
      expect(exitCodeOf("--shipped", "--mentions", "gmail-label")).toBe(2);
      expect(exitCodeOf("--mentions", "gmail-label")).toBe(2);
    });
  });

  test("lists the other entries whose English names a pin's word, beside the pins that hold them", async () => {
    const catalog = await parseCatalog(
      [
        'msgid ""',
        'msgstr ""',
        '"Language: es\\n"',
        "",
        'msgid "Wide"',
        'msgstr "Amplio"',
        "",
        'msgid "Switches between narrow and wide."',
        'msgstr "Cambia entre estrecho y amplio."',
        "",
        'msgid "Keeps the sidebar wide."',
        'msgstr "Mantiene la barra lateral ancha."',
        "",
        'msgid "Widescreen"',
        'msgstr "Panorámico"',
        "",
      ].join("\n"),
      { locale: "es", sourceLocale: "en", filename: "es.po" },
    );

    const mentions = pinMentions(await loadSidecar("es"), [{ path: "es.po", catalog }], "wide");

    expect(mentions.map(({ msgid, pinnedBy }) => [msgid, pinnedBy])).toEqual([
      ["Switches between narrow and wide.", ["wide-in-sentences"]],
      ["Keeps the sidebar wide.", []],
    ]);
  });

  test("lists a msgidPattern pin's mentions by its pattern, untranslated ones marked", async () => {
    const catalog = await parseCatalog(
      [
        'msgid ""',
        'msgstr ""',
        '"Language: de\\n"',
        "",
        'msgctxt "Gmail label"',
        'msgid "Label"',
        'msgstr "Label"',
        "",
        'msgid "Color a label"',
        'msgstr "Ein Label einfärben"',
        "",
        'msgid "Remove label"',
        'msgstr ""',
        "",
        'msgid "Labelled"',
        'msgstr ""',
        "",
      ].join("\n"),
      { locale: "de", sourceLocale: "en", filename: "de.po" },
    );

    const mentions = pinMentions(
      await loadSidecar("de"),
      [{ path: "de.po", catalog }],
      "gmail-label",
    );

    expect(
      mentions.map(({ msgid, msgstr, untranslated }) => [msgid, msgstr, untranslated]),
    ).toEqual([
      ["Color a label", "Ein Label einfärben", undefined],
      ["Remove label", "", true],
    ]);
  });
});
