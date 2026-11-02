import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  readGeneratedTable,
  renderPlatformTable,
  tableCells,
} from "../.claude/skills/translate/platform-table";
import {
  duplicateRuleIds,
  LANGUAGES_DIR,
  loadSidecar,
  PLATFORMS,
  platformEntries,
  sidecarPath,
  sidecarSchema,
  styleSheetPath,
  withoutAccessKey,
} from "../.claude/skills/translate/rules";
import { type CatalogTag, SHIPPED_CATALOG_TAGS } from "../packages/shared/i18n/tags";
import { parseCatalog } from "./i18n-check";

/*
 * Lives here rather than beside the rules because `bun test` never looks inside
 * a dot directory such as `.claude`.
 */

const SOURCE_CATALOGS = [
  "packages/shared/i18n/locales/en.po",
  "packages/preload-gmail/locales/en.po",
].map((catalog) => path.join(import.meta.dir, "..", catalog));

const locales = (await readdir(LANGUAGES_DIR))
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(0, -".md".length));

async function sourcePlatformEntries() {
  const keys: string[] = [];

  for (const catalogPath of SOURCE_CATALOGS) {
    const catalog = await parseCatalog(await Bun.file(catalogPath).text(), {
      locale: "en",
      sourceLocale: "en",
      filename: catalogPath,
    });

    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.context && (PLATFORMS as readonly string[]).includes(entry.context)) {
        keys.push(`${entry.context} ${entry.message ?? id}`);
      }
    }
  }

  return keys.sort();
}

/** The kinds of label whose form a style sheet's Label forms section states, one `- **<kind>:**` line each. */
const LABEL_KINDS = [
  "Button",
  "Menu bar item",
  "Context or popup menu item",
  "Select option",
  "Checkbox or switch label",
  "Setting description",
  "OS label",
];

/** Each kind the style sheet's `## Label forms` section gives no form for, or the section itself. */
function missingLabelForms(markdown: string) {
  const section = /^## Label forms\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(markdown)?.[1];

  if (section === undefined) {
    return ["## Label forms"];
  }

  return LABEL_KINDS.filter(
    (kind) => !new RegExp(`^- \\*\\*${kind}:\\*\\* \\S`, "mu").test(section),
  );
}

/*
 * A sheet's `- **Setting description never opens with:**` line, as each
 * English verb it names with that verb's imperatives, lower-cased: its
 * entries read `Show _Zeige_ _Blende_; Hide _Blende_`, after the line's colon.
 */
function bannedDescriptionOpeners(markdown: string) {
  const line = /^- \*\*Setting description never opens with:\*\* [^:]*: (.*)$/mu.exec(
    markdown,
  )?.[1];

  const openers = new Map<string, string[]>();

  for (const [, verb, words] of (line ?? "").matchAll(/(?:^|; )(\p{Lu}\p{Ll}+)((?: _[^_]+_)+)/gu)) {
    openers.set(
      verb as string,
      [...(words as string).matchAll(/_([^_]+)_/gu)].map(([, word]) =>
        (word as string).toLocaleLowerCase(),
      ),
    );
  }

  return openers;
}

/** First words of a description's English that are no verb, so no imperative of theirs is listed. */
const NON_VERB_OPENERS = new Set([
  "A",
  "Extensions",
  "Gmail",
  "How",
  "Meru",
  "No",
  "Where",
  "With",
]);

/** The English verb a description opens with, past a leading adverb such as Automatically. */
function englishOpener(msgid: string) {
  const [first, second] = msgid.split(" ");

  const verb = first?.endsWith("ly") && second ? second[0]?.toUpperCase() + second.slice(1) : first;

  return verb === undefined || NON_VERB_OPENERS.has(verb) ? undefined : verb.replace(/\W+$/u, "");
}

/** Every Settings description in a catalog: its English, its context and its translation. */
async function catalogDescriptions(locale: string) {
  const catalogPath = path.join(import.meta.dir, `../packages/shared/i18n/locales/${locale}.po`);

  if (!(await Bun.file(catalogPath).exists())) {
    return undefined;
  }

  const spans = await descriptionSpans();

  const catalog = await parseCatalog(await Bun.file(catalogPath).text(), {
    locale,
    sourceLocale: "en",
    filename: catalogPath,
  });

  return Object.entries(catalog).flatMap(([id, entry]) => {
    const msgid = entry.message ?? id;

    const wanted = letters(msgid);

    return msgid.endsWith(".") && wanted !== "" && spans.some((span) => span.includes(wanted))
      ? [{ msgid, context: entry.context, translation: entry.translation ?? "" }]
      : [];
  });
}

test("a never-opens-with line reads as each verb with its imperatives", () => {
  expect(
    bannedDescriptionOpeners(
      "- **Setting description never opens with:** the _du_ imperative: Show _Zeige_ _Blende_; Hide _Blende_. Then more.",
    ),
  ).toEqual(
    new Map([
      ["Show", ["zeige", "blende"]],
      ["Hide", ["blende"]],
    ]),
  );
  expect(englishOpener("Automatically select the first account.")).toBe("Select");
  expect(englishOpener("How long a tab waits.")).toBeUndefined();
});

const RENDERER_DIR = path.join(import.meta.dir, "../packages/renderer");

/** The source from `start` to the `}` that closes the brace there, or to `close`. */
function spanFrom(source: string, start: number, close?: string) {
  if (close !== undefined) {
    return source.slice(start, Math.max(start, source.indexOf(close, start)));
  }

  for (let index = start, depth = 0; index < source.length; index++) {
    if (source[index] === "{") {
      depth++;
    } else if (source[index] === "}" && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  return "";
}

/** A message's letters alone, so `${appName}` meets `{appName}` and `<strong>` meets `<0>`. */
function letters(text: string) {
  return text.replace(/<[^>]*>/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** The source of every `description=` prop and `<FieldDescription>` in the renderer, as letters. */
async function descriptionSpans() {
  const spans: string[] = [];

  for (const file of await readdir(RENDERER_DIR, { recursive: true })) {
    if (!file.endsWith(".tsx") || file.split(path.sep).includes("node_modules")) {
      continue;
    }

    const source = await Bun.file(path.join(RENDERER_DIR, file)).text();

    for (const match of source.matchAll(/\bdescription=(?=\{)|<FieldDescription>/gu)) {
      const start = (match.index ?? 0) + match[0].length;

      spans.push(
        letters(
          match[0] === "<FieldDescription>"
            ? spanFrom(source, start, "</FieldDescription>")
            : spanFrom(source, start),
        ),
      );
    }
  }

  return spans;
}

/** Descriptions that tell the user to do something elsewhere, so they open with the imperative. */
const INSTRUCTION_DESCRIPTIONS = new Set([
  "Choose Meru as the default mail client in Windows Settings.",
  "Swipe left or right with two fingers on a trackpad to go back or forward. Swipe between pages must also be on in System Settings.",
]);

/*
 * The words a description is read by: its first, and the first after a
 * leading phrase's comma, such as Spanish's Con varias bandejas, elegir…
 */
function openingWords(translation: string) {
  const sentence = translation.replace(/^[^\p{L}]+/u, "").split(/(?<=\.)\s/u)[0] ?? "";

  const word = (text: string) => /^\p{L}+/u.exec(text.trim())?.[0]?.toLocaleLowerCase();

  return [word(sentence), word(sentence.split(",")[1] ?? "")].filter(
    (opener): opener is string => opener !== undefined,
  );
}

test("a description's opening words are its first and the one after a leading phrase", () => {
  expect(openingWords("Con varias bandejas, elige qué secciones cuentan. Deja, la lista")).toEqual([
    "con",
    "elige",
  ]);
  expect(openingWords("„Die Farbe“ auswählen.")).toEqual(["die"]);
});

test("a Label forms section missing a kind, or a stub, is caught", () => {
  const stated = LABEL_KINDS.map((kind) => `- **${kind}:** the infinitive.`);

  expect(missingLabelForms(["## Label forms", "", ...stated, "", "## Next"].join("\n"))).toEqual(
    [],
  );
  expect(
    missingLabelForms(["## Label forms", "", ...stated.slice(1), "## Next", stated[0]].join("\n")),
  ).toEqual(["Button"]);
  expect(missingLabelForms("## Label forms\n\nDecided before the run.\n")).toEqual(LABEL_KINDS);
  expect(missingLabelForms("## Buttons and menu items\n")).toEqual(["## Label forms"]);
});

describe("language sidecars", () => {
  test("every style sheet has a sidecar, and every sidecar a style sheet", async () => {
    const sidecars = (await readdir(LANGUAGES_DIR))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));

    expect(sidecars.sort()).toEqual([...locales].sort());
  });

  test("a table that differs from its sidecar's rows by one word is caught", async () => {
    const sidecar = await loadSidecar("fr");

    const changed = {
      ...sidecar,
      platformWords: {
        ...sidecar.platformWords,
        rows: sidecar.platformWords.rows.map((row, index) =>
          index === 0 ? { ...row, Linux: [{ word: "Dossier", labels: ["File"] }] } : row,
        ),
      },
    };

    const table = readGeneratedTable(await Bun.file(styleSheetPath("fr")).text(), "fr") ?? [];

    expect(tableCells(table)).not.toEqual(tableCells(renderPlatformTable(changed)));
  });

  test("a sidecar that gives two rules one id does not load", async () => {
    const sidecar = await Bun.file(sidecarPath("fr")).json();

    const planted = { ...sidecar, pinned: [...sidecar.pinned, { ...sidecar.pinned[0] }] };

    expect(duplicateRuleIds(planted)).toEqual([sidecar.pinned[0].id]);
    expect(sidecarSchema.safeParse(planted).success).toBe(false);
  });

  for (const locale of locales) {
    describe(locale, () => {
      test("gives every rule an id of its own", async () => {
        expect(duplicateRuleIds(await Bun.file(sidecarPath(locale)).json())).toEqual([]);
      });

      test("the style sheet's Platform words table is the one its sidecar writes", async () => {
        const table = readGeneratedTable(await Bun.file(styleSheetPath(locale)).text(), locale);

        expect(table, "the table's markers").toBeDefined();
        expect(tableCells(table ?? [])).toEqual(
          tableCells(renderPlatformTable(await loadSidecar(locale))),
        );
      });

      test("a filled sidecar covers every platform entry in the source catalogs, and no other", async () => {
        const entries = platformEntries(await loadSidecar(locale));

        if (entries.length === 0) {
          return;
        }

        const covered = [...new Set(entries.map((word) => `${word.msgctxt} ${word.msgid}`))].sort();

        expect(covered).toEqual(await sourcePlatformEntries());
      });

      test.if(SHIPPED_CATALOG_TAGS.includes(locale as CatalogTag))(
        "a shipped language's style sheet states the form of each kind of label",
        async () => {
          expect(missingLabelForms(await Bun.file(styleSheetPath(locale)).text())).toEqual([]);
        },
      );

      test("no Settings description opens with an imperative its sheet rules out", async () => {
        const openers = bannedDescriptionOpeners(await Bun.file(styleSheetPath(locale)).text());

        const descriptions = await catalogDescriptions(locale);

        if (openers.size === 0 || descriptions === undefined) {
          return;
        }

        const banned = [...openers.values()].flat();

        const found = descriptions
          .filter(
            ({ msgid, translation }) =>
              !INSTRUCTION_DESCRIPTIONS.has(msgid) &&
              openingWords(translation).some((word) => banned.includes(word)),
          )
          .map(({ msgid, context, translation }) => `${context ?? "-"} ${msgid} => ${translation}`);

        expect(found).toEqual([]);
      });

      test("the never-opens-with line names every English verb a description opens with", async () => {
        const openers = bannedDescriptionOpeners(await Bun.file(styleSheetPath(locale)).text());

        const descriptions = await catalogDescriptions(locale);

        if (openers.size === 0 || descriptions === undefined) {
          return;
        }

        const missing = descriptions.flatMap(({ msgid }) => {
          const verb = englishOpener(msgid);

          return verb === undefined || openers.has(verb) ? [] : [`${verb}: ${msgid}`];
        });

        expect(missing).toEqual([]);
      });

      /*
       * `packages/app/os-role-labels.test.ts` lets the page context menu's
       * `&Copy` go without a Windows or Linux context because its house word is
       * Microsoft's and GNOME's word; a language where it isn't needs the split.
       */
      test("the page context menu's house Copy is Windows' and Linux's word for Copy", async () => {
        const catalogPath = path.join(
          import.meta.dir,
          `../packages/shared/i18n/locales/${locale}.po`,
        );

        if (!(await Bun.file(catalogPath).exists())) {
          return;
        }

        const catalog = await parseCatalog(await Bun.file(catalogPath).text(), {
          locale,
          sourceLocale: "en",
          filename: catalogPath,
        });

        const house = Object.entries(catalog).find(
          ([id, entry]) => (entry.message ?? id) === "&Copy" && !entry.context,
        )?.[1].translation;

        const rows = (await loadSidecar(locale)).platformWords.rows;

        const wordsFor = (msgid: string) =>
          rows.flatMap((row) =>
            (["Windows", "Linux"] as const).flatMap((platform) => {
              const cell = row[platform];

              return typeof cell === "string"
                ? []
                : cell
                    .filter(({ labels = [] }) => labels.includes(msgid))
                    .map(({ word }) => `${platform} ${word}`);
            }),
          );

        expect(house, "the catalog's &Copy").toBeTruthy();
        expect(wordsFor("&Copy"), "a Windows or Linux word for &Copy").toEqual([]);
        expect(wordsFor("Copy")).toEqual([
          `Windows ${withoutAccessKey(house ?? "")}`,
          `Linux ${withoutAccessKey(house ?? "")}`,
        ]);
      });

      // A table row that settles a sentence is copied into one, where a menu's ellipsis never belongs.
      test("a platform word that settles a sentence has no menu ellipsis", async () => {
        const sidecar = await loadSidecar(locale);

        const withEllipsis = sidecar.platformWords.rows.flatMap((row) =>
          PLATFORMS.flatMap((platform) => {
            const cell = row[platform];

            return typeof cell === "string"
              ? []
              : cell
                  .filter(({ word, sentences = [] }) => sentences.length > 0 && word.endsWith("…"))
                  .map(({ word }) => `${row.row} (${platform}): ${word}`);
          }),
        );

        expect(withEllipsis).toEqual([]);
      });
    });
  }
});
