import { describe, expect, test } from "bun:test";
import { formatter } from "@lingui/format-po";
import { applyTranslations, sliceGlossary } from "../.claude/skills/translate/collect";

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

describe("sliceGlossary", () => {
  const GLOSSARY = `# Glossary

One fixed word per term.

## Settings

The window.

- de: Einstellungen
- ja: 設定
  with no ellipsis on Windows

## Tab

- de: Tab
- ja: タブ

| Term | de |
| --- | --- |

- Something else
`;

  test("keeps every heading and paragraph and only the locale's bullets", () => {
    const { text, warnings } = sliceGlossary(GLOSSARY, "ja", ["de", "ja"]);

    expect(text).toBe(`# Glossary

One fixed word per term.

## Settings

The window.

- ja: 設定
  with no ellipsis on Windows

## Tab

- ja: タブ
`);

    expect(warnings).toEqual([
      'glossary.md:18: skipped "| Term | de |"',
      'glossary.md:19: skipped "| --- | --- |"',
      'glossary.md:21: skipped "- Something else"',
    ]);
  });
});
