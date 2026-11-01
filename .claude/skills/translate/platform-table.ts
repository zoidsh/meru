import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  LANGUAGES_DIR,
  loadSidecar,
  PLATFORMS,
  type PlatformRow,
  type Sidecar,
  styleSheetPath,
} from "./rules";

/*
 * Writes each style sheet's Platform words table from its sidecar's rows, so a
 * platform word is decided in one place. `scripts/translate-rules.test.ts`
 * fails when a table and its sidecar differ.
 */

const HEADER = ["English", "macOS (Apple)", "Windows (Microsoft)", "Linux (GNOME)"];

export function beginMarker(locale: string) {
  return `<!-- Generated from ${locale}.json by platform-table.ts: change the sidecar's rows, then run \`bun .claude/skills/translate/platform-table.ts ${locale}\`. -->`;
}

export const END_MARKER = "<!-- End of the generated table. -->";

function renderCell(cell: PlatformRow[(typeof PLATFORMS)[number]]) {
  if (typeof cell === "string") {
    return cell;
  }

  return cell
    .map(({ word, source }) => {
      if (!source) {
        return `_${word}_`;
      }

      return `_${word}_${source.startsWith("(") ? " " : ", "}${source}`;
    })
    .join("; ");
}

/** The table's lines, unpadded; `oxfmt` aligns them once they are in the file. */
export function renderPlatformTable(sidecar: Sidecar) {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;

  return [
    line(HEADER),
    line(HEADER.map(() => "---")),
    ...sidecar.platformWords.rows.map((row) =>
      line([row.row, ...PLATFORMS.map((platform) => renderCell(row[platform]))]),
    ),
  ];
}

/** A table's cells, trimmed, without its delimiter row, so padding never counts. */
export function tableCells(lines: string[]) {
  return lines
    .filter((line) => line.startsWith("|") && !/^\|[\s|:-]+\|$/u.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

/** The lines between the markers, or undefined when the style sheet has none. */
function tableBounds(lines: string[], locale: string) {
  const begin = lines.indexOf(beginMarker(locale));

  const end = lines.indexOf(END_MARKER);

  return begin === -1 || end < begin ? undefined : { begin, end };
}

export function readGeneratedTable(markdown: string, locale: string) {
  const lines = markdown.split("\n");

  const bounds = tableBounds(lines, locale);

  return bounds && lines.slice(bounds.begin + 1, bounds.end);
}

export function writeGeneratedTable(markdown: string, locale: string, table: string[]) {
  const lines = markdown.split("\n");

  const bounds = tableBounds(lines, locale);

  if (!bounds) {
    throw new Error(`${locale}.md has no generated Platform words table between markers`);
  }

  return [...lines.slice(0, bounds.begin + 1), "", ...table, "", ...lines.slice(bounds.end)].join(
    "\n",
  );
}

async function run() {
  const { positionals } = parseArgs({ allowPositionals: true });

  const locales =
    positionals.length > 0
      ? positionals
      : (await readdir(LANGUAGES_DIR))
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -".json".length));

  const paths: string[] = [];

  for (const locale of locales) {
    const styleSheet = styleSheetPath(locale);

    const table = renderPlatformTable(await loadSidecar(locale));

    await Bun.write(
      styleSheet,
      writeGeneratedTable(await Bun.file(styleSheet).text(), locale, table),
    );

    paths.push(styleSheet);
  }

  const { exitCode } = Bun.spawnSync(["bunx", "oxfmt", ...paths], {
    cwd: path.join(import.meta.dir, "../../.."),
    stdout: "inherit",
    stderr: "inherit",
  });

  process.exit(exitCode);
}

if (import.meta.main) {
  await run();
}
