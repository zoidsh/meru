import { describe, expect, test } from "bun:test";
import path from "node:path";
import { setEntry } from "../.claude/skills/translate/set-entry";

const CATALOG = `msgid ""
msgstr ""
"Language: de\\n"

#. Option of the Width setting
#: packages/shared/tabs.ts
#, fuzzy
msgctxt "width"
msgid "Auto"
msgstr "Automatisch"

#. Option of the Placement setting
#: packages/shared/tabs.ts
#, fuzzy, javascript-format
msgctxt "placement"
msgid "Auto"
msgstr "Automatisch"

#: packages/renderer/a.tsx
msgid "Save"
msgstr ""

#~ msgid "Gone"
#~ msgstr "Weg"
`;

describe("set-entry.ts", () => {
  test("accepts a fuzzy copy without a msgstr, keeping its other flags and every other line", () => {
    const width = setEntry(CATALOG, { msgctxt: "width", msgid: "Auto" });

    expect(width).toEqual({
      errors: [],
      text: CATALOG.replace('#, fuzzy\nmsgctxt "width"', 'msgctxt "width"'),
    });

    expect(setEntry(CATALOG, { msgctxt: "placement", msgid: "Auto" }).text).toBe(
      CATALOG.replace("#, fuzzy, javascript-format", "#, javascript-format"),
    );
  });

  test("sets a msgstr, clearing fuzzy", () => {
    expect(
      setEntry(CATALOG, { msgctxt: "width", msgid: "Auto", msgstr: 'Auto "breit"' }).text,
    ).toBe(
      CATALOG.replace(
        '#, fuzzy\nmsgctxt "width"\nmsgid "Auto"\nmsgstr "Automatisch"',
        'msgctxt "width"\nmsgid "Auto"\nmsgstr "Auto \\"breit\\""',
      ),
    );

    expect(setEntry(CATALOG, { msgid: "Save", msgstr: "Sichern" }).text).toBe(
      CATALOG.replace('msgid "Save"\nmsgstr ""', 'msgid "Save"\nmsgstr "Sichern"'),
    );
  });

  test("refuses an untranslated accept, an empty msgstr and an entry that isn't there", () => {
    expect(setEntry(CATALOG, { msgid: "Save" }).errors).toEqual([
      "the entry is untranslated, so there is nothing to accept; give --msgstr",
    ]);

    expect(setEntry(CATALOG, { msgctxt: "width", msgid: "Auto", msgstr: "" }).errors).toEqual([
      "--msgstr is empty",
    ]);

    expect(setEntry(CATALOG, { msgid: "Auto", msgstr: "x" }).errors).toEqual([
      '"Auto" matches no entry; that msgid has msgctxt "width", "placement"',
    ]);

    expect(setEntry(CATALOG, { msgid: "Gone", msgstr: "x" }).text).toBeUndefined();
  });

  test("refuses a gettext plural as a plural", () => {
    const plural = `${CATALOG}\nmsgid "file"\nmsgid_plural "files"\nmsgstr[0] "Datei"\nmsgstr[1] "Dateien"\n`;

    expect(setEntry(plural, { msgid: "file" }).errors).toEqual([
      "the entry is a gettext plural, which Lingui never writes",
    ]);
    expect(setEntry(plural, { msgid: "file", msgstr: "Datei" }).errors).toEqual([
      "the entry is a gettext plural, which Lingui never writes",
    ]);
  });

  describe("command", () => {
    function run(...args: string[]) {
      const result = Bun.spawnSync(["bun", ".claude/skills/translate/set-entry.ts", ...args], {
        cwd: path.join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      });

      return { exitCode: result.exitCode, stderr: result.stderr.toString() };
    }

    test("names the contexts a msgid has when the one given isn't among them", () => {
      const result = run("--locale", "de", "--msgid", "Light", "--context", "no such context");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        '; that msgid has msgctxt none in app, "tray icon color" in app',
      );
    });

    test("refuses a catalog that isn't one of the locale's", () => {
      const result = run("--locale", "de", "--msgid", "Light", "--catalog", "nope");

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("--catalog takes app or preload-gmail");
    });
  });
});
