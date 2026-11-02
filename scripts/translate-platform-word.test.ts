import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  type AppleString,
  parsePoEntries,
  parseTbxEntries,
} from "../.claude/skills/translate/corpus";
import {
  buildRow,
  findCandidates,
  formatCandidates,
  type PlatformData,
  type RowOptions,
  withRow,
} from "../.claude/skills/translate/platform-word";
import { loadSidecar } from "../.claude/skills/translate/rules";

const FIXTURES = path.join(import.meta.dir, "../.claude/skills/translate/fixtures/platform-word");

const fixture = (name: string) => Bun.file(path.join(FIXTURES, name)).text();

const dutch: PlatformData = {
  apple: (await fixture("apple.nl.jsonl"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AppleString),
  tbx: parseTbxEntries(await fixture("DUTCH.tbx")),
  gnome: [{ project: "gtk", entries: parsePoEntries(await fixture("gtk.nl.po")) }],
};

const japanese: PlatformData = {
  apple: [],
  tbx: [],
  gnome: [{ project: "nautilus", entries: parsePoEntries(await fixture("nautilus.ja.po")) }],
};

describe("the sources' own data", () => {
  test("a TBX entry keeps its id and its English definition", () => {
    expect(parseTbxEntries(`<termEntry id="1_2_3">x</termEntry>`)).toEqual([
      { id: "1_2_3", english: [], translated: [] },
    ]);

    expect(dutch.tbx.find((entry) => entry.id === "9679_334563_1103965")).toEqual({
      id: "9679_334563_1103965",
      definition: "To close a program & its windows.",
      english: ["quit"],
      translated: ["afsluiten"],
    });
  });

  test("a PO entry keeps its msgctxt, and a fuzzy one is left out", () => {
    const entries = japanese.gnome[0]?.entries ?? [];

    expect(entries).toContainEqual({
      msgctxt: "shortcuts dialog",
      msgid: "Copy",
      msgstr: "コピー",
    });
    expect(parsePoEntries(["#, fuzzy", 'msgid "Copy"', 'msgstr "Kopie"'].join("\n"))).toEqual([]);
  });
});

describe("findCandidates", () => {
  test("gives each platform's word with the ids a sidecar row cites, the exact English first", () => {
    const { macOS, Windows, Linux } = findCandidates("Copy", dutch);

    expect(macOS).toEqual([
      {
        word: "Kopieer",
        exact: true,
        sources: [
          { source: "(AppKit `MenuCommands` `Copy`)", english: "Copy" },
          { source: "(Mail `MainMenu` `25.title`)", english: "Copy" },
          {
            source: "(AppKit `AccessibilityImageDescriptions` `NSCopyTemplate`)",
            english: "copy",
          },
        ],
      },
      {
        word: "Kopiëren",
        exact: false,
        sources: [{ source: "(WebKit `Localizable` `Copy (context menu item)`)", english: "COPY" }],
      },
    ]);

    expect(Windows.map(({ word, sources }) => [word, sources.map(({ source }) => source)])).toEqual(
      [
        ["Kopiëren", ["(TBX `11991_39848_39866`)"]],
        ["Exemplaar", ["(TBX `7275_1764513_702747`)"]],
      ],
    );
    expect(Windows[0]?.sources[0]?.definition).toStartWith("To duplicate data");

    expect(Linux).toEqual([
      { word: "Kopiëren", exact: true, sources: [{ source: "(gtk4 `_Copy`)", english: "_Copy" }] },
    ]);
  });

  test("matches an access key, an ellipsis and a placeholder as Meru writes them", () => {
    expect(findCandidates("C&opy", dutch).macOS[0]?.word).toBe("Kopieer");

    expect(findCandidates("Check for Updates…", dutch).macOS[0]?.word).toBe("Zoek naar updates…");

    expect(findCandidates("Quit {appName}", dutch).Linux).toEqual([
      {
        word: "{appName} afsluiten",
        exact: true,
        sources: [{ source: "(gtk4 `Quit %s`)", english: "Quit %s" }],
      },
    ]);
  });

  test("reads Mail's own name as Meru's {appName}", () => {
    expect(findCandidates("Quit {appName}", dutch).macOS).toEqual([
      {
        word: "Stop Mail",
        exact: false,
        sources: [{ source: "(Mail `MainMenu` `631.title`)", english: "Quit Mail" }],
      },
    ]);
  });

  test("drops GNOME's Japanese access key and cites a msgctxt", () => {
    expect(findCandidates("Copy", japanese).Linux).toEqual([
      {
        word: "コピー",
        exact: true,
        sources: [
          { source: "(nautilus `shortcuts dialog` `Copy`)", english: "Copy" },
          { source: "(nautilus `_Copy`)", english: "_Copy" },
        ],
      },
    ]);
  });

  test("an untranslated or unmatched entry gives no word", () => {
    expect(findCandidates("Check for Updates…", dutch).Linux).toEqual([]);
    expect(findCandidates("Paste", dutch)).toEqual({ macOS: [], Windows: [], Linux: [] });
  });
});

test("formatCandidates lists every platform, its words and their sources", () => {
  expect(formatCandidates("nl", findCandidates("Quit", dutch), 1)).toBe(
    [
      "nl",
      "  macOS",
      "    (none)",
      "  Windows",
      "    Afsluiten",
      "      (TBX `9679_334563_1103965`) “quit” To close a program & its windows.",
      "  Linux",
      "    (none)",
    ].join("\n"),
  );
});

describe("buildRow", () => {
  const options: RowOptions = {
    row: "Copy, the Edit menu item",
    labels: ["Copy"],
    sentences: [],
    platforms: ["macOS", "Windows", "Linux"],
    note: "macOS and Windows and Linux only",
    picks: {},
    cites: {},
  };

  test("refuses a cell whose first candidates tie, naming each, unless it is picked", () => {
    expect(
      buildRow("nl", findCandidates("Copy", dutch), { ...options, platforms: ["Windows"] }),
    ).toEqual({
      errors: [
        "nl:Windows: the first candidates tie: Kopiëren (TBX `11991_39848_39866`); Exemplaar (TBX `7275_1764513_702747`); give --pick nl:Windows=<word>",
      ],
    });
  });

  test("refuses a first candidate that only names a key, unless it is picked", () => {
    const help = findCandidates("Help", dutch);

    expect(buildRow("nl", help, { ...options, platforms: ["macOS", "Linux"] })).toEqual({
      errors: [
        "nl:macOS: Help-toets (AppKit `FunctionKeyNames` `Help`) names a key or an accessibility label, not a label; give --pick nl:macOS=<word>",
        "nl:Linux: Help (gtk4 `keyboard label` `Help`) names a key or an accessibility label, not a label; give --pick nl:Linux=<word>",
      ],
    });
    expect(
      buildRow("nl", help, {
        ...options,
        platforms: ["macOS"],
        picks: { "nl:macOS": "Help-toets" },
      }),
    ).toHaveProperty("row");
  });

  test("takes each platform's first candidate and its first source", () => {
    expect(
      buildRow("nl", findCandidates("Copy", dutch), {
        ...options,
        picks: { "nl:Windows": "Kopiëren" },
      }),
    ).toEqual({
      row: {
        row: "Copy, the Edit menu item",
        macOS: [{ word: "Kopieer", source: "(AppKit `MenuCommands` `Copy`)", labels: ["Copy"] }],
        Windows: [{ word: "Kopiëren", source: "(TBX `11991_39848_39866`)", labels: ["Copy"] }],
        Linux: [{ word: "Kopiëren", source: "(gtk4 `_Copy`)", labels: ["Copy"] }],
      },
    });
  });

  test("gives a platform the row leaves out its note, and takes a pick and a cite", () => {
    const built = buildRow("nl", findCandidates("Copy", dutch), {
      ...options,
      sentences: ["Copy the link."],
      labels: [],
      platforms: ["Windows", "Linux"],
      note: "macOS shows Apple's word",
      picks: { "nl:Windows": "Exemplaar", "nl:Linux": "Kopieer" },
      cites: { "nl:Linux": "inferred from gtk4 `_Copy`" },
    });

    expect(built).toEqual({
      row: {
        row: "Copy, the Edit menu item",
        macOS: "macOS shows Apple's word",
        Windows: [
          {
            word: "Exemplaar",
            source: "(TBX `7275_1764513_702747`)",
            sentences: ["Copy the link."],
          },
        ],
        Linux: [
          { word: "Kopieer", source: "inferred from gtk4 `_Copy`", sentences: ["Copy the link."] },
        ],
      },
    });
  });

  test("names each cell it can't fill, and how to fill it", () => {
    expect(
      buildRow("nl", findCandidates("Check for Updates…", dutch), {
        ...options,
        picks: { "nl:Windows": "Zoek naar updates" },
      }),
    ).toEqual({
      errors: [
        "nl:Windows: no candidate is Zoek naar updates; give --cite nl:Windows=<source>",
        "nl:Linux: no candidate; give --pick nl:Linux=<word> and --cite nl:Linux=<source>",
      ],
    });
  });

  test("withRow adds the row after the others, and refuses a name a row already has", async () => {
    const sidecar = await loadSidecar("nl");

    const built = buildRow("nl", findCandidates("Copy", dutch), {
      ...options,
      row: "Planted",
      picks: { "nl:Windows": "Kopiëren" },
    });

    if (!("row" in built)) {
      throw new Error(built.errors.join("\n"));
    }

    expect(withRow(sidecar, built.row)?.platformWords.rows.at(-1)).toEqual(built.row);
    expect(withRow(sidecar, { ...built.row, row: "File" })).toBeUndefined();
  });
});
