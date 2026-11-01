import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

/*
 * `SKILL.md` keeps the run and links out to the rest, so an agent following
 * `/translate` reaches everything only through those links. Lives here
 * because `bun test` never looks inside a dot directory such as `.claude`.
 */

const TRANSLATE_DIR = path.join(import.meta.dir, "../.claude/skills/translate");

/** A heading's anchor as GitHub writes it. */
function slug(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/gu, "-");
}

async function anchorsOf(file: string) {
  const text = await Bun.file(file).text();

  return new Set(
    [...text.matchAll(/^#{1,6} (.+)$/gmu)].map(([, heading]) => slug(heading as string)),
  );
}

const files = [
  ...(await readdir(TRANSLATE_DIR)).filter((name) => name.endsWith(".md")),
  ...(await readdir(path.join(TRANSLATE_DIR, "languages")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `languages/${name}`),
];

describe("the translate skill's links", () => {
  for (const file of files) {
    test(`every relative link in ${file} reaches a file and heading`, async () => {
      const from = path.join(TRANSLATE_DIR, file);

      const text = (await Bun.file(from).text()).replace(/```[\s\S]*?```/gu, "");

      const broken: string[] = [];

      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
        if (!target || /^[a-z]+:/u.test(target)) {
          continue;
        }

        const [relative = "", anchor] = target.split("#");

        const resolved = relative ? path.resolve(path.dirname(from), relative) : from;

        if (!(await Bun.file(resolved).exists())) {
          broken.push(`${target}: no file`);
        } else if (anchor && resolved.endsWith(".md") && !(await anchorsOf(resolved)).has(anchor)) {
          broken.push(`${target}: no heading`);
        }
      }

      expect(broken).toEqual([]);
    });
  }

  test("SKILL.md links every file it moved out", async () => {
    const skill = await Bun.file(path.join(TRANSLATE_DIR, "SKILL.md")).text();

    for (const file of ["source-order.md", "counting.md", "adding-a-language.md", "measuring.md"]) {
      expect(skill).toContain(`](${file})`);
    }
  });
});
