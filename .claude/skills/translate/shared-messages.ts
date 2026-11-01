import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { type Catalog, catalogFiles, parse } from "./collect";

/*
 * A msgid without a context that several places share has one translation
 * for all of them, which breaks in a language whose word has to agree with a
 * different noun in each, as Light and Dark do under Theme and under the tray
 * icon's colour. Translators only ever raised these one language at a time,
 * so the lead reads this list before a language's first run and splits a
 * message the language can't share with `split-message.ts`.
 */

export type SharedMessage = {
  catalog: string;
  msgid: string;
  comments: string[];
  references: string[];
};

/** Each msgid without a context described by more than one `#.` comment, each a place that may need its own word. */
export function sharedMessages(name: string, catalog: Catalog): SharedMessage[] {
  return Object.entries(catalog).flatMap(([id, entry]) => {
    if (entry.obsolete || entry.context !== undefined) {
      return [];
    }

    const comments = [...new Set(entry.comments ?? [])];

    const references = [...new Set((entry.origin ?? []).map(([file]) => file))];

    return comments.length > 1
      ? [{ catalog: name, msgid: entry.message ?? id, comments, references }]
      : [];
  });
}

export function formatSharedMessages(messages: SharedMessage[]) {
  return messages.flatMap(({ catalog, msgid, comments, references }) => [
    `${catalog} ${JSON.stringify(msgid)}`,
    ...comments.map((comment) => `  #. ${comment}`),
    ...references.map((reference) => `  #: ${reference}`),
  ]);
}

const USAGE = `Usage: bun .claude/skills/translate/shared-messages.ts [--json]

Lists every msgid without a msgctxt in the English catalogs that more than one
#. comment describes, with its comments and references, so the lead can split
those a new language can't share before its first run. --json prints them as a
JSON array instead.`;

async function main() {
  const { values } = parseArgs({
    options: { json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });

  if (values.help) {
    console.log(USAGE);

    return;
  }

  const config = getConfig();

  const messages: SharedMessage[] = [];

  for (const file of catalogFiles(config, config.sourceLocale)) {
    const catalog = await parse(
      await Bun.file(file.absolute).text(),
      config.sourceLocale,
      config.sourceLocale,
      file.relative,
    );

    messages.push(...sharedMessages(file.name, catalog));
  }

  console.log(
    values.json ? JSON.stringify(messages, null, 2) : formatSharedMessages(messages).join("\n"),
  );

  console.error(`${messages.length} shared messages`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`shared-messages.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
