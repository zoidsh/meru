import path from "node:path";
import { parseArgs } from "node:util";
import { appendPoEntries, poEntries } from "./collect";

/*
 * Appends one entry to `fixtures/<tag>-clean.po` or `fixtures/<tag>-faults.po`,
 * one blank line after the last and ending with a newline, which a hand edit
 * that glues an entry onto the previous one's msgstr gets wrong.
 */

export const FIXTURES_DIR = path.join(import.meta.dir, "fixtures");

export type FixtureEntry = {
  msgctxt?: string;
  msgid: string;
  msgstr: string;
  origin?: string;
  fault?: string;
};

export function appendFixtureEntry(text: string, entry: FixtureEntry) {
  // Two wordings of one msgid are both allowed, so only the same msgstr again is a duplicate.
  const duplicate = poEntries(text.split("\n")).some(
    ({ context, id, msgstr }) =>
      context === entry.msgctxt && id === entry.msgid && msgstr === entry.msgstr,
  );

  const comments = [
    ...(entry.fault === undefined ? [] : [`# fault: ${entry.fault}`]),
    ...(entry.origin === undefined ? [] : [`#: ${entry.origin}`]),
  ];

  return { text: appendPoEntries(text, [{ ...entry, comments }]), duplicate };
}

const USAGE = `Usage: bun .claude/skills/translate/fixture.ts <tag> clean|faults --msgid <English> --msgstr <translation> [--msgctxt <context>] [--origin <path>] [--fault <rule>:<id>]

Appends one entry to fixtures/<tag>-<kind>.po. A faults entry needs --fault,
the rule it plants, and a clean one takes none. It refuses an entry the
file already has, with the same msgctxt, msgid and msgstr.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      msgid: { type: "string" },
      msgstr: { type: "string" },
      msgctxt: { type: "string" },
      origin: { type: "string" },
      fault: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [tag, kind] = positionals;

  const valid =
    tag !== undefined &&
    (kind === "clean" || kind === "faults") &&
    values.msgid !== undefined &&
    values.msgstr !== undefined &&
    (kind === "faults") === (values.fault !== undefined) &&
    (values.fault === undefined || /^[a-z-]+:\S+$/u.test(values.fault));

  if (values.help || !valid) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const file = path.join(FIXTURES_DIR, `${tag}-${kind}.po`);

  if (!(await Bun.file(file).exists())) {
    console.error(`No fixture ${file}; adding-a-language.md says how one starts.`);

    process.exit(2);
  }

  const result = appendFixtureEntry(await Bun.file(file).text(), {
    msgctxt: values.msgctxt,
    msgid: values.msgid as string,
    msgstr: values.msgstr as string,
    origin: values.origin,
    fault: values.fault,
  });

  if (result.duplicate) {
    console.error(
      `${file} already has ${JSON.stringify(values.msgid)} with that msgctxt and msgstr.`,
    );

    process.exit(1);
  }

  await Bun.write(file, result.text);

  console.log(`Appended to ${file}; run bun test --isolate scripts/translate-check.test.ts.`);
}

if (import.meta.main) {
  await main();
}
