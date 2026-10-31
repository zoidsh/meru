import { describe, expect, test } from "bun:test";
import { formatter } from "@lingui/format-po";
import {
  applyTranslations,
  blindCatalogs,
  type Catalog,
  dumpCatalogs,
  pairBackTranslations,
  sliceGlossary,
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

describe("blindCatalogs", () => {
  test("lists only an opaque key and the translation, keeping the source apart", async () => {
    const catalog = `${HEADER}
#. Toast once a message has been sent
#: packages/preload-gmail/ipc.ts
msgctxt "toast"
msgid "Message sent"
msgstr "Nachricht gesendet"

#: packages/app/menu.ts
msgid "{count} unread"
msgstr "{count} ungelesen"

#: packages/app/menu.ts
msgid "Untranslated"
msgstr ""

#~ msgid "Preferences"
#~ msgstr "Einstellungen"
`;

    const { blind, sources } = blindCatalogs([
      { name: "app", catalog: (await po.parse(catalog, context)) as Catalog },
    ]);

    expect(blind).toEqual([
      { key: "e1", msgstr: "Nachricht gesendet" },
      { key: "e2", msgstr: "{count} ungelesen" },
    ]);

    expect(sources).toEqual({
      e1: {
        catalog: "app",
        msgctxt: "toast",
        msgid: "Message sent",
        comments: ["Toast once a message has been sent"],
      },
      e2: { catalog: "app", msgid: "{count} unread", comments: [] },
    });

    const paired = pairBackTranslations(sources, { e1: "Message sent", e3: "Stray" });

    expect(paired.text)
      .toBe(`Columns: key | msgctxt | English source | back-translation | comments. "-" is no msgctxt.
e1 | "toast" | "Message sent" | "Message sent" | Toast once a message has been sent
`);

    expect({ missing: paired.missing, unknown: paired.unknown }).toEqual({
      missing: ["e2"],
      unknown: ["e3"],
    });
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
