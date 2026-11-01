import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { CATALOG_TAGS } from "../../../packages/shared/i18n/tags";
import { appendPoEntries, catalogFiles, poEntries } from "./collect";

/*
 * When a msgid shared by several labels is split by `context`, extract makes
 * each context a new, untranslated entry and drops the old one, so every
 * locale would be translated again from nothing. Run before extract, this
 * copies the old entry's translation into each new context, marked fuzzy, so
 * the next run reviews whether it agrees with its context instead.
 */

export type Split = { msgid: string; from: string | undefined; contexts: string[] };

/** The catalog with an entry for each new context, and which it wrote or found already there. */
export function splitMessage(text: string, split: Split) {
  const entries = poEntries(text.split("\n"));

  const old = entries.find(({ context, id }) => context === split.from && id === split.msgid);

  if (!old) {
    return { text, written: [], present: [], translation: undefined };
  }

  const translation = old.msgstr;

  const present = split.contexts.filter((context) =>
    entries.some((entry) => entry.context === context && entry.id === split.msgid),
  );

  const written = translation ? split.contexts.filter((context) => !present.includes(context)) : [];

  if (written.length === 0) {
    return { text, written, present, translation };
  }

  const added = written.map((context) => ({
    comments: ["#, fuzzy"],
    msgctxt: context,
    msgid: split.msgid,
    msgstr: translation,
  }));

  return { text: appendPoEntries(text, added), written, present, translation };
}

const USAGE = `Usage: bun .claude/skills/translate/split-message.ts --msgid <English> [--from <msgctxt>] --context <msgctxt>…

Before bun run i18n:extract, copies the translation of the entry with this
msgid, and the msgctxt --from names or none, into a fuzzy entry for each
--context, in every locale's catalogs. An entry already there is left alone.`;

async function main() {
  const { values } = parseArgs({
    options: {
      msgid: { type: "string" },
      from: { type: "string" },
      context: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || values.msgid === undefined || !values.context?.length) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const split: Split = { msgid: values.msgid, from: values.from, contexts: values.context };

  const config = getConfig();

  let found = false;

  for (const tag of CATALOG_TAGS.filter((tag) => tag !== config.sourceLocale)) {
    for (const file of catalogFiles(config, tag)) {
      const catalog = Bun.file(file.absolute);

      if (!(await catalog.exists())) {
        continue;
      }

      const result = splitMessage(await catalog.text(), split);

      if (result.translation === undefined) {
        continue;
      }

      found = true;

      if (result.written.length > 0) {
        await Bun.write(file.absolute, result.text);
      }

      const what = [
        result.written.length > 0 ? `wrote ${result.written.join(", ")}` : "",
        result.present.length > 0 ? `already has ${result.present.join(", ")}` : "",
        result.translation ? "" : "untranslated, nothing to copy",
      ].filter(Boolean);

      console.log(`${file.relative}: ${what.join("; ")}`);
    }
  }

  if (!found) {
    console.error(
      `No catalog has ${JSON.stringify(split.msgid)}${split.from === undefined ? " without a msgctxt" : ` with msgctxt ${JSON.stringify(split.from)}`}; run it before extract drops the old entry.`,
    );

    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`split-message.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
