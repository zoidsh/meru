import { describe, expect, test } from "bun:test";
import { parse } from "../.claude/skills/translate/collect";
import { splitMessage } from "../.claude/skills/translate/split-message";

const CATALOG = `msgid ""
msgstr ""
"Language: de\\n"

#. Option of the Width setting
#: packages/shared/tabs.ts
msgid "Auto"
msgstr "Automatisch"

#, fuzzy
msgctxt "placement"
msgid "Auto"
msgstr "Auto"

#~ msgid "Gone"
#~ msgstr "Weg"
`;

describe("split-message.ts", () => {
  test("copies the old translation into each new context, fuzzy, leaving one already there", async () => {
    const result = splitMessage(CATALOG, {
      msgid: "Auto",
      from: undefined,
      contexts: ["width", "placement", "text color"],
    });

    expect(result.written).toEqual(["width", "text color"]);
    expect(result.present).toEqual(["placement"]);
    expect(result.text.startsWith(CATALOG)).toBe(true);

    const catalog = Object.values(await parse(result.text, "de", "en", "de.po"));

    const auto = catalog
      .filter((entry) => entry.message === "Auto" || entry.translation?.startsWith("Auto"))
      .map((entry) => [entry.context ?? null, entry.translation, entry.extra?.flags ?? []]);

    expect(auto).toEqual([
      [null, "Automatisch", []],
      ["placement", "Auto", ["fuzzy"]],
      ["width", "Automatisch", ["fuzzy"]],
      ["text color", "Automatisch", ["fuzzy"]],
    ]);
  });

  test("splits from a context, and leaves a catalog without the entry or its translation alone", () => {
    expect(
      splitMessage(CATALOG, { msgid: "Auto", from: "placement", contexts: ["dock"] }).text,
    ).toContain('#, fuzzy\nmsgctxt "dock"\nmsgid "Auto"\nmsgstr "Auto"\n');

    expect(splitMessage(CATALOG, { msgid: "Gone", from: undefined, contexts: ["x"] })).toEqual({
      text: CATALOG,
      written: [],
      present: [],
      translation: undefined,
    });

    const untranslated = CATALOG.replace('msgstr "Automatisch"', 'msgstr ""');

    expect(
      splitMessage(untranslated, { msgid: "Auto", from: undefined, contexts: ["width"] }).text,
    ).toBe(untranslated);
  });
});
