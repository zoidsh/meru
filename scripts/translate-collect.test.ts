import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatter } from "@lingui/format-po";
import {
  applyTranslations,
  type Catalog,
  dumpCatalogs,
  listLocale,
  mergeBase,
  sliceGlossary,
  translationChanges,
  withSourceOrder,
} from "../.claude/skills/translate/collect";

/*
 * Lives here rather than beside the script because `bun test` never looks
 * inside a dot directory such as `.claude`.
 */

const HEADER = `msgid ""
msgstr ""
"POT-Creation-Date: 2026-10-20 12:17+0100\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=utf-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"X-Generator: @lingui/cli\\n"
"Language: de\\n"
`;

const CATALOG = `${HEADER}
#. Title of the settings window
#: packages/app/settings.ts
#: packages/renderer/routes/settings.tsx
msgid "Settings"
msgstr ""

#. App menu item that opens the settings window
#: packages/app/menu.ts
msgctxt "macOS"
msgid "Settings"
msgstr ""

#. App menu item that opens the settings window
#: packages/app/menu.ts
msgctxt "Windows"
msgid "Settings"
msgstr ""

#. Accessible name of the region Meru's own toasts appear in
#: packages/app/toast.ts
#, fuzzy
msgid "Notifications"
msgstr "Hinweise"

#: packages/app/dialogs.ts
msgid "Meru {version} is the last version that runs on macOS {macOSVersion}. Newer versions need macOS 13 or later."
msgstr ""

#~ msgid "Preferences"
#~ msgstr "Einstellungen"
`;

const po = formatter({ lineNumbers: false });

const context = { locale: "de", sourceLocale: "en", filename: "de.po" };

async function roundTrip(text: string) {
  return po.serialize(await po.parse(text, context), { ...context, existing: text });
}

describe("applyTranslations", () => {
  test("starts from a catalog that Lingui would write unchanged", async () => {
    expect(await roundTrip(CATALOG)).toBe(CATALOG);
  });

  test("writes each msgstr by its context, clears fuzzy and leaves every other line alone", async () => {
    const { text, errors } = applyTranslations(CATALOG, [
      { msgid: "Settings", msgstr: "Einstellungen" },
      { msgctxt: "macOS", msgid: "Settings", msgstr: "Einstellungen …" },
      { msgid: "Notifications", msgstr: "Mitteilungen" },
      {
        msgid:
          "Meru {version} is the last version that runs on macOS {macOSVersion}. Newer versions need macOS 13 or later.",
        msgstr:
          'Meru {version} ist die letzte Version für „macOS {macOSVersion}“.\nNeuere "Versionen" brauchen macOS 13.',
      },
    ]);

    expect(errors).toEqual([]);

    expect(text).toBe(
      CATALOG.replace(
        'msgid "Settings"\nmsgstr ""\n\n#. App menu item that opens the settings window\n#: packages/app/menu.ts\nmsgctxt "macOS"\nmsgid "Settings"\nmsgstr ""',
        'msgid "Settings"\nmsgstr "Einstellungen"\n\n#. App menu item that opens the settings window\n#: packages/app/menu.ts\nmsgctxt "macOS"\nmsgid "Settings"\nmsgstr "Einstellungen …"',
      )
        .replace(
          '#, fuzzy\nmsgid "Notifications"\nmsgstr "Hinweise"',
          'msgid "Notifications"\nmsgstr "Mitteilungen"',
        )
        .replace(
          'or later."\nmsgstr ""',
          'or later."\nmsgstr "Meru {version} ist die letzte Version für „macOS {macOSVersion}“.\\n"\n"Neuere \\"Versionen\\" brauchen macOS 13."',
        ),
    );

    expect(await roundTrip(text ?? "")).toBe(text ?? "");

    const catalog = await po.parse(text ?? "", context);

    expect(Object.values(catalog).map((entry) => [entry.context, entry.translation])).toEqual([
      [undefined, "Einstellungen"],
      ["macOS", "Einstellungen …"],
      ["Windows", ""],
      [undefined, "Mitteilungen"],
      [
        undefined,
        'Meru {version} ist die letzte Version für „macOS {macOSVersion}“.\nNeuere "Versionen" brauchen macOS 13.',
      ],
      [undefined, "Einstellungen"],
    ]);
  });

  test("rejects a key that matches no entry, and writes nothing", () => {
    expect(
      applyTranslations(CATALOG, [
        { msgctxt: "Windows", msgid: "Settings", msgstr: "Einstellungen" },
        { msgctxt: "Linux", msgid: "Settings", msgstr: "Einstellungen" },
        { msgid: "Preferences", msgstr: "Einstellungen" },
      ]),
    ).toEqual({
      errors: [
        '"Settings" with msgctxt "Linux" matches no entry; that msgid has msgctxt none, "macOS", "Windows"',
        '"Preferences" matches no entry',
      ],
    });
  });

  test("rejects a key given twice, or one that matches two entries", () => {
    const doubled = `${CATALOG}
#: packages/app/other.ts
msgctxt "macOS"
msgid "Settings"
msgstr ""
`;

    expect(
      applyTranslations(doubled, [
        { msgctxt: "macOS", msgid: "Settings", msgstr: "Einstellungen …" },
        { msgid: "Notifications", msgstr: "Mitteilungen" },
        { msgid: "Notifications", msgstr: "Benachrichtigungen" },
      ]),
    ).toEqual({
      errors: [
        '"Settings" with msgctxt "macOS" matches 2 entries',
        '"Notifications" is given more than once',
      ],
    });
  });
});

test("applyTranslations rejects a gettext plural rather than miss it", () => {
  const plural = `${CATALOG}
msgid "One file"
msgid_plural "{0} files"
msgstr[0] ""
msgstr[1] ""
`;

  expect(applyTranslations(plural, [{ msgid: "One file", msgstr: "Eine Datei" }])).toEqual({
    errors: ['"One file" is a gettext plural, which Lingui never writes'],
  });
});

describe("dumpCatalogs", () => {
  test("lists every live entry under its first origin, marking the ones used in several files", async () => {
    const gmail = `${HEADER}
#. Toast in the Gmail view once a message has been sent
#: packages/preload-gmail/ipc.ts
msgid "Message sent"
msgstr "Nachricht gesendet"
`;

    const parse = async (text: string) => (await po.parse(text, context)) as Catalog;

    const { text, total, multiOrigin } = dumpCatalogs("de", [
      { name: "app", relative: "app/de.po", catalog: await parse(CATALOG) },
      { name: "preload-gmail", relative: "gmail/de.po", catalog: await parse(gmail) },
    ]);

    expect(text).toBe(`# de: every entry, grouped by the file it comes from

Columns: msgctxt | msgid | msgstr | comments | origins. "-" is no msgctxt. "[multi]" marks an entry used in more than one file, listed under the first.

## app: app/de.po

### packages/app/dialogs.ts

- | "Meru {version} is the last version that runs on macOS {macOSVersion}. Newer versions need macOS 13 or later." | "" |  | packages/app/dialogs.ts

### packages/app/menu.ts

"macOS" | "Settings" | "" | App menu item that opens the settings window | packages/app/menu.ts
"Windows" | "Settings" | "" | App menu item that opens the settings window | packages/app/menu.ts

### packages/app/settings.ts

[multi] - | "Settings" | "" | Title of the settings window | packages/app/settings.ts, packages/renderer/routes/settings.tsx

### packages/app/toast.ts

- | "Notifications" | "Hinweise" (fuzzy) | Accessible name of the region Meru's own toasts appear in | packages/app/toast.ts

## preload-gmail: gmail/de.po

### packages/preload-gmail/ipc.ts

- | "Message sent" | "Nachricht gesendet" | Toast in the Gmail view once a message has been sent | packages/preload-gmail/ipc.ts
`);

    expect({ total, multiOrigin }).toEqual({ total: 6, multiOrigin: 1 });
  });
});

describe("sliceGlossary", () => {
  const GLOSSARY = `# Glossary

One fixed word per term.

- A rule for every language
  that runs on

1. First, the house word.
2. Then Apple's.

## Settings

The window.

- de: Einstellungen
  on every platform
- ja: 設定
  with no ellipsis on Windows
- de-CH: Einstellungen
- **de**: Einstellungen
- de (Apple): Einstellungen

## Tab

- de: Tab
- ja: タブ

| Term | de |
| --- | --- |

\`\`\`
de: Tab
\`\`\`
`;

  test("drops only the other locales' bullets, warning on what it can't split", () => {
    const { text, warnings } = sliceGlossary(GLOSSARY, "ja", ["de", "ja"]);

    expect(text).toBe(`# Glossary

One fixed word per term.

- A rule for every language
  that runs on

1. First, the house word.
2. Then Apple's.

## Settings

The window.

- ja: 設定
  with no ellipsis on Windows

## Tab

- ja: タブ
`);

    expect(warnings).toEqual([
      'glossary.md:19: skipped "- de-CH: Einstellungen"',
      'glossary.md:20: skipped "- **de**: Einstellungen"',
      'glossary.md:21: skipped "- de (Apple): Einstellungen"',
      'glossary.md:28: skipped "| Term | de |"',
      'glossary.md:29: skipped "| --- | --- |"',
      'glossary.md:31: skipped "```"',
    ]);
  });
});

describe("withSourceOrder", () => {
  test("puts the source order in place of the paragraph that links to it, keeping the rest", () => {
    const slice =
      "# Glossary\n\n## Where a word comes from\n\nCapitals are the base form.\n\nSee source-order.md.\n\n## Tab\n\n- ja: タブ\n";

    const sourceOrder =
      "# Where a word comes from\n\n1. The system's.\n\n## How a source is cited\n\nIn brackets.\n";

    expect(withSourceOrder(slice, sourceOrder)).toBe(
      "# Glossary\n\n## Where a word comes from\n\nCapitals are the base form.\n\n1. The system's.\n\n### How a source is cited\n\nIn brackets.\n\n## Tab\n\n- ja: タブ\n",
    );
  });

  test("gives the real slice the source order in full and no link in its place", async () => {
    const translateDir = path.join(import.meta.dir, "../.claude/skills/translate");

    const sourceOrder = await Bun.file(path.join(translateDir, "source-order.md")).text();

    const { text } = sliceGlossary(
      await Bun.file(path.join(translateDir, "glossary.md")).text(),
      "fr",
    );

    const slice = withSourceOrder(text, sourceOrder);

    expect(slice).toContain(
      sourceOrder.split("\n").find((line) => line.includes("(4c)")) ?? "(4c)",
    );
    expect(slice).not.toContain("in place of this paragraph");
    expect(slice).toContain("Capitalization below is the base form inside a sentence.");
  });
});

describe("listLocale", () => {
  const atBase: Catalog = {
    a: { message: "Settings", translation: "Einstellungen" },
    b: { message: "Quit", translation: "Beenden" },
  };

  const locale = (catalog: Catalog, base: Catalog | null = atBase) => [
    {
      name: "app",
      relative: "packages/shared/i18n/locales/de.po",
      catalog,
      earlier: base ? [base] : [],
      atBase: base ?? undefined,
    },
  ];

  test("decides each locale on its own: entries to translate, or else its changed translations to review", () => {
    const translating = listLocale(
      locale({ ...atBase, c: { message: "New", translation: "" } }),
      "beta",
    );

    const reviewing = listLocale(
      locale({ ...atBase, a: { message: "Settings", translation: "Optionen" } }),
      "beta",
    );

    expect(translating).toMatchObject({ kind: "translate", count: 1 });
    expect(translating.kind === "translate" && translating.sections.join()).toContain(
      'msgid: "New"\n  status: untranslated',
    );

    expect(reviewing).toMatchObject({ kind: "review", count: 1 });
    expect(reviewing.kind === "review" && reviewing.sections.join()).toContain(
      'status: changed since beta, current translation "Optionen", was "Einstellungen"',
    );
  });

  test("has nothing to do only when nothing changed, and can't tell without a merge base", () => {
    expect(listLocale(locale(atBase), "beta")).toEqual({ kind: "none" });
    expect(listLocale(locale(atBase, null), "beta")).toEqual({ kind: "unknown" });
  });
});

describe("translationChanges", () => {
  test("lists each live translation that is new or differs, with what it was", () => {
    const earlier: Catalog = {
      a: { message: "Settings", translation: "Einstellungen" },
      b: { message: "Quit", translation: "Beenden" },
      c: { message: "Back", translation: "Zurück", obsolete: true },
    };

    const current: Catalog = {
      a: { message: "Settings", translation: "Optionen" },
      b: { message: "Quit", translation: "Beenden" },
      c: { message: "Back", translation: "Zurück" },
      d: { message: "New", translation: "Neu" },
      e: { message: "Empty", translation: "" },
      f: { message: "Gone", translation: "Weg", obsolete: true },
    };

    expect(
      translationChanges(current, earlier).map(({ id, previous }) => [id, previous?.translation]),
    ).toEqual([
      ["a", "Einstellungen"],
      ["c", undefined],
      ["d", undefined],
    ]);
  });
});

describe("mergeBase", () => {
  /*
   * A repository where `beta` moved on after the last fetch and the feature
   * branch was rebased onto it, so `origin/beta` is stale.
   */
  async function repository() {
    const dir = await mkdtemp(path.join(tmpdir(), "translate-merge-base-"));

    const run = (...args: string[]) => {
      const result = Bun.spawnSync(["git", ...args], { cwd: dir, stderr: "pipe" });

      if (!result.success) {
        throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
      }

      return result.stdout.toString().trim();
    };

    const commit = (message: string) => {
      run(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-q",
        "-m",
        message,
      );

      return run("rev-parse", "HEAD");
    };

    run("init", "-q", "-b", "beta");

    const fetched = commit("fetched");

    run("update-ref", "refs/remotes/origin/beta", fetched);

    const rebasedOnto = commit("beta after the fetch");

    run("checkout", "-q", "-b", "feature");

    commit("feature");

    return { dir, rebasedOnto };
  }

  test("takes the merge base nearest HEAD, whichever of a branch and its remote twin is newer", async () => {
    const { dir, rebasedOnto } = await repository();

    const cwd = process.cwd();

    process.chdir(dir);

    try {
      expect(mergeBase("origin/beta")).toBe(rebasedOnto);
      expect(mergeBase("beta")).toBe(rebasedOnto);
      expect(mergeBase("missing")).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });
});
