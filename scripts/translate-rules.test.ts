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
