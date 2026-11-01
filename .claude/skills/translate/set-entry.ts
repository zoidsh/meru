import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { applyTranslations, catalogFiles, poEntries } from "./collect";

export type EntryEdit = { msgctxt?: string; msgid: string; msgstr?: string };

function findEntry(text: string, edit: EntryEdit) {
  return poEntries(text.split("\n")).find(
    (entry) => entry.context === edit.msgctxt && entry.id === edit.msgid,
  );
}

/*
 * One entry's msgstr set, or with no msgstr its translation accepted as it
 * stands, such as a fuzzy copy `split-message.ts` made that still fits its
 * context. Either way the fuzzy flag goes, and every other line of the file
 * stays as it was.
 */
export function setEntry(text: string, edit: EntryEdit) {
  const current = findEntry(text, edit);

  if (current?.plural) {
    return { errors: ["the entry is a gettext plural, which Lingui never writes"] };
  }

  const msgstr = edit.msgstr ?? current?.msgstr;

  if (current && !msgstr) {
    return {
      errors: [
        edit.msgstr === undefined
          ? "the entry is untranslated, so there is nothing to accept; give --msgstr"
          : "--msgstr is empty",
      ],
    };
  }

  return applyTranslations(text, [
    { msgctxt: edit.msgctxt, msgid: edit.msgid, msgstr: msgstr ?? "" },
  ]);
}

const USAGE = `Usage: bun .claude/skills/translate/set-entry.ts --locale <tag> --msgid <English> [--context <msgctxt>] [--msgstr <translation>] [--catalog app|preload-gmail]

Sets one entry's msgstr in a locale's catalog and clears its fuzzy flag,
leaving every comment, flag, reference and other entry as it was. Without
--msgstr it keeps the translation and only clears fuzzy, which accepts a copy
split-message.ts made. --catalog is needed only when both catalogs have the
entry. Exits 1 when no entry, or more than one, matches.`;

async function main() {
  const { values } = parseArgs({
    options: {
      locale: { type: "string" },
      msgid: { type: "string" },
      context: { type: "string" },
      msgstr: { type: "string" },
      catalog: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || !values.locale || values.msgid === undefined) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const config = getConfig();

  if (values.locale === config.sourceLocale || !config.locales.includes(values.locale)) {
    console.error(
      `--locale takes one of ${config.locales.filter((tag) => tag !== config.sourceLocale).join(", ")}.`,
    );

    process.exit(2);
  }

  const edit: EntryEdit = { msgctxt: values.context, msgid: values.msgid, msgstr: values.msgstr };

  const catalogs = catalogFiles(config, values.locale);

  if (values.catalog !== undefined && !catalogs.some(({ name }) => name === values.catalog)) {
    console.error(
      `--catalog takes ${catalogs.map(({ name }) => name).join(" or ")}, not ${JSON.stringify(values.catalog)}.`,
    );

    process.exit(2);
  }

  const files = await Promise.all(
    catalogs
      .filter(({ name }) => values.catalog === undefined || name === values.catalog)
      .map(async (file) => ({ ...file, text: await Bun.file(file.absolute).text() })),
  );

  const holding = files.filter(({ text }) => findEntry(text, edit));

  const [file] = holding;

  if (!file || holding.length > 1) {
    const contexts = files.flatMap(({ name, text }) =>
      poEntries(text.split("\n"))
        .filter((entry) => entry.id === edit.msgid)
        .map(
          (entry) =>
            `${entry.context === undefined ? "none" : JSON.stringify(entry.context)} in ${name}`,
        ),
    );

    console.error(
      holding.length > 1
        ? `Both catalogs have the entry; pass --catalog ${holding.map(({ name }) => name).join(" or ")}.`
        : `No ${values.catalog ? `${values.catalog} ` : ""}catalog of ${values.locale} has that msgid${edit.msgctxt === undefined ? " without a msgctxt" : ` with msgctxt ${JSON.stringify(edit.msgctxt)}`}${contexts.length > 0 ? `; that msgid has msgctxt ${contexts.join(", ")}` : ""}.`,
    );

    process.exit(1);
  }

  const result = setEntry(file.text, edit);

  if (result.text === undefined || result.errors.length > 0) {
    console.error(`Wrote nothing: ${result.errors.join("; ")}`);

    process.exit(1);
  }

  await Bun.write(file.absolute, result.text);

  console.log(
    `${file.relative}: ${values.msgstr === undefined ? "accepted" : "set"} ${JSON.stringify(edit.msgid)}`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`set-entry.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
