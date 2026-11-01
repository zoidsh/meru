import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  gnomePairs,
  hasLanguage,
  HttpError,
  parseAndroidStrings,
  parsePo,
  unknownTags,
} from "../.claude/skills/translate/corpus";

const escape = (hex: string) => `\\u${hex}`;

const ROOT = path.join(import.meta.dir, "..");

function run(script: string, ...args: string[]) {
  const result = Bun.spawnSync(["bun", `.claude/skills/translate/${script}`, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

describe("android", () => {
  test("reads every escape Android decodes as its character", () => {
    expect([
      ...parseAndroidStrings(
        [
          String.raw`<string name="lines">"Zwei\nZeilen"</string>`,
          String.raw`<string name="quotes">l\'app \"neu\"</string>`,
          `<string name="unicode">Weiter${escape("2026")} ${escape("00e9")}t${escape("00e9")}</string>`,
          String.raw`<string name="others">\@home \?a back\\slash\ttab</string>`,
        ].join("\n"),
      ).values(),
    ]).toEqual(["Zwei\nZeilen", 'l\'app "neu"', "Weiter… été", "@home ?a back\\slash\ttab"]);
  });
});

describe("po", () => {
  test("leaves out fuzzy entries, as LibreOffice's unreviewed guesses are", () => {
    expect(
      parsePo(
        [
          "#. abc12",
          'msgctxt "menu"',
          'msgid "Badge"',
          'msgstr "Abzeichen"',
          "",
          "#, fuzzy",
          'msgid "Badges"',
          'msgstr "Plaketten"',
          "",
          "#, c-format, fuzzy",
          'msgid "%d badges"',
          'msgstr "%d Plaketten"',
          "",
          "#. fuzzy is only a word here",
          'msgid "Fuzzy"',
          'msgstr "Unscharf"',
          "",
        ].join("\n"),
      ),
    ).toEqual([
      ["Badge", "Abzeichen"],
      ["Fuzzy", "Unscharf"],
    ]);
  });
});

describe("gnome", () => {
  const PO = [
    'msgid ""',
    'msgstr ""',
    '"Language: de\\n"',
    "",
    "#: src/window.c:12",
    'msgid "_Quit"',
    'msgstr "_Beenden"',
    "",
    "#, fuzzy",
    'msgid "Files"',
    'msgstr "Ordner"',
    "",
    "#, c-format, fuzzy",
    'msgid "%d items"',
    'msgstr "%d Dinge"',
    "",
    'msgctxt "file menu"',
    'msgid "Open"',
    'msgstr "Öffnen"',
    "",
  ].join("\n");

  test("reads each project's translations, fuzzy ones left out, and skips one without the language", async () => {
    const asked: string[] = [];

    const warnings: string[] = [];

    const pairs = await gnomePairs(
      "pt-BR",
      async (project, code) => {
        asked.push(`${project}/${code}`);

        if (project === "nautilus") {
          throw new HttpError(`${project}/${code}.po`, 404);
        }

        return project === "gtk" ? PO : "";
      },
      (warning) => warnings.push(warning),
    );

    expect(asked).toEqual([
      "gtk/pt_BR",
      "nautilus/pt_BR",
      "gnome-text-editor/pt_BR",
      "gnome-control-center/pt_BR",
    ]);
    expect(pairs).toEqual([
      ["_Quit", "_Beenden"],
      ["Open", "Öffnen"],
    ]);
    expect(warnings).toEqual(["gnome pt-BR: nautilus has no po/pt_BR.po; skipping it"]);
  });

  test("fails on anything but a missing file", async () => {
    await expect(
      gnomePairs("de", async () => {
        throw new HttpError("gtk/de.po", 503);
      }),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("tags", () => {
  test("only Meru's own tags are known, English, the source, aside", () => {
    expect(unknownTags(["de", "pt-BR", "nl", "en", "xx"])).toEqual(["en", "xx"]);
  });

  test("a source without the language is told apart from a corpus not built yet", () => {
    expect(hasLanguage("vscode", "nl")).toBe(false);
    expect(hasLanguage("vscode", "sv")).toBe(false);
    expect(hasLanguage("vscode", "de")).toBe(true);
    expect(hasLanguage("android", "nl")).toBe(true);
    expect(hasLanguage("apple", "nl")).toBe(true);
  });

  test("vote.ts and corpus.ts refuse a tag that isn't Meru's", () => {
    for (const args of [
      ["vote.ts", "--missing", "en"],
      ["vote.ts", "--missing", "xx"],
      ["vote.ts", "xx"],
      ["corpus.ts", "xx"],
    ] as const) {
      const [script, ...rest] = args;

      const result = run(script, ...rest);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(`Unknown tag ${rest.at(-1)}`);
    }
  });
});
