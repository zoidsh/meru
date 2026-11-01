import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "@lingui/conf";
import { catalogFiles, parse } from "../.claude/skills/translate/collect";
import {
  LANGUAGES_DIR,
  loadSidecar,
  pinExamples,
  withoutAccessKey,
} from "../.claude/skills/translate/rules";

/*
 * A pin's example is the wording the rule allows, and a translator copies it,
 * so an example that has drifted from the catalog it stands for, by a word or
 * only by case as Brazilian Portuguese's did, teaches the wrong text. Each
 * example whose entry the language's catalog has translated must read as that
 * translation does, access keys aside.
 */

const config = getConfig({ cwd: path.join(import.meta.dir, "..") });

const tags = (await readdir(LANGUAGES_DIR))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -".json".length));

async function translations(tag: string) {
  const byKey = new Map<string, string>();

  for (const file of catalogFiles(config, tag)) {
    const catalog = Bun.file(file.absolute);

    if (!(await catalog.exists())) {
      continue;
    }

    for (const [id, entry] of Object.entries(
      await parse(await catalog.text(), tag, config.sourceLocale, file.relative),
    )) {
      if (!entry.obsolete && entry.translation && !entry.extra?.flags?.includes("fuzzy")) {
        byKey.set(`${entry.context ?? ""}\u0004${entry.message ?? id}`, entry.translation);
      }
    }
  }

  return byKey;
}

describe("sidecar examples", () => {
  for (const tag of tags) {
    test(`each pin example of ${tag} reads as its catalog translates its entry`, async () => {
      const catalog = await translations(tag);

      const drifted = pinExamples(await loadSidecar(tag)).flatMap((example) => {
        const translation = catalog.get(`${example.msgctxt ?? ""}\u0004${example.msgid}`);

        return example.clean === undefined ||
          translation === undefined ||
          withoutAccessKey(translation) === withoutAccessKey(example.clean)
          ? []
          : [{ id: example.id, clean: example.clean, catalog: translation }];
      });

      expect(drifted).toEqual([]);
    });
  }
});
