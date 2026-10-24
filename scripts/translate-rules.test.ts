import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  LANGUAGES_DIR,
  loadSidecar,
  PLATFORMS,
  type PlatformTableRow,
  type PlatformWord,
  readPlatformTable,
  styleSheetPath,
} from "../.claude/skills/translate/rules";
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

function withoutEllipsis(word: string) {
  return word.replace(/[\s ]*…$/u, "");
}

function expectedWord(word: PlatformWord) {
  return "msgstr" in word ? word.msgstr : word.contains;
}

function isWordOf(word: PlatformWord, tableWord: string) {
  return "msgstr" in word
    ? word.msgstr === tableWord
    : word.contains === withoutEllipsis(tableWord);
}

/** Every disagreement between a Platform words table and its sidecar, both ways. */
function platformDrift(rows: PlatformTableRow[], words: PlatformWord[]) {
  const drift: string[] = [];

  for (const word of words) {
    const row = rows.find((candidate) => candidate.english === word.row);

    if (!row) {
      drift.push(`sidecar row “${word.row}” is not in the table`);
    } else if (!row.words[word.msgctxt].some((tableWord) => isWordOf(word, tableWord))) {
      drift.push(
        `sidecar ${word.msgctxt} “${word.msgid}” expects “${expectedWord(word)}”, which the table's “${word.row}” cell does not give: ${JSON.stringify(row.words[word.msgctxt])}`,
      );
    }
  }

  for (const row of rows) {
    for (const platform of PLATFORMS) {
      for (const tableWord of row.words[platform]) {
        const isUsed = words.some(
          (word) =>
            word.row === row.english && word.msgctxt === platform && isWordOf(word, tableWord),
        );

        if (!isUsed) {
          drift.push(`table “${row.english}” ${platform} “${tableWord}” is in no sidecar entry`);
        }
      }
    }
  }

  return drift;
}

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

describe("language sidecars", () => {
  test("every style sheet has a sidecar, and every sidecar a style sheet", async () => {
    const sidecars = (await readdir(LANGUAGES_DIR))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));

    expect(sidecars.sort()).toEqual([...locales].sort());
  });

  for (const locale of locales) {
    describe(locale, () => {
      test("the sidecar agrees with the style sheet's Platform words table", async () => {
        const rows = readPlatformTable(await Bun.file(styleSheetPath(locale)).text());

        const sidecar = await loadSidecar(locale);

        expect(platformDrift(rows, sidecar.platformWords.entries)).toEqual([]);
      });

      test("a filled sidecar covers every platform entry in the source catalogs, and no other", async () => {
        const sidecar = await loadSidecar(locale);

        if (sidecar.platformWords.entries.length === 0) {
          return;
        }

        const covered = [
          ...new Set(sidecar.platformWords.entries.map((word) => `${word.msgctxt} ${word.msgid}`)),
        ].sort();

        expect(covered).toEqual(await sourcePlatformEntries());
      });
    });
  }
});
