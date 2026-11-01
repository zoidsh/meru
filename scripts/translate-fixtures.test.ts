import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { appendFixtureEntry, FIXTURES_DIR } from "../.claude/skills/translate/fixture";

/*
 * An entry appended by hand to a file without a final newline lands on its
 * last msgstr's line, so every fixture ends with one.
 */

const files = (await readdir(FIXTURES_DIR, { recursive: true })).filter((file) =>
  /\.(po|jsonl?|txt)$/u.test(file),
);

describe("fixtures", () => {
  test("every fixture file ends with a newline", async () => {
    const without: string[] = [];

    for (const file of files) {
      if (!(await Bun.file(path.join(FIXTURES_DIR, file)).text()).endsWith("\n")) {
        without.push(file);
      }
    }

    expect(files.length).toBeGreaterThan(0);
    expect(without).toEqual([]);
  });
});

describe("fixture.ts", () => {
  const catalog =
    'msgid ""\nmsgstr ""\n"Language: de\\n"\n\nmsgid "Settings"\nmsgstr "Einstellungen"';

  test("appends an entry after one blank line, ending with a newline", () => {
    const result = appendFixtureEntry(catalog, {
      msgctxt: "macOS",
      msgid: 'Quit "Meru"',
      msgstr: "„Meru“ beenden",
      origin: "packages/app/menu.ts",
      fault: "banned:example",
    });

    expect(result.duplicate).toBe(false);
    expect(result.text).toBe(
      `${catalog}\n\n# fault: banned:example\n#: packages/app/menu.ts\nmsgctxt "macOS"\nmsgid "Quit \\"Meru\\""\nmsgstr "„Meru“ beenden"\n`,
    );
    expect(appendFixtureEntry(`${catalog}\n\n\n`, { msgid: "A", msgstr: "B" }).text).toBe(
      `${catalog}\n\nmsgid "A"\nmsgstr "B"\n`,
    );
  });

  test("flags the same msgid and msgstr again, but not a second wording", () => {
    expect(
      appendFixtureEntry(catalog, { msgid: "Settings", msgstr: "Einstellungen" }).duplicate,
    ).toBe(true);
    expect(appendFixtureEntry(catalog, { msgid: "Settings", msgstr: "Optionen" }).duplicate).toBe(
      false,
    );
  });
});
