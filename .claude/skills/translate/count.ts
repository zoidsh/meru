import { parseArgs } from "node:util";
import { CORPUS_DIR, type Pair, readCorpus, type Source, SOURCE_NAMES, SOURCES } from "./corpus";
import { type BannedRule, loadSidecar, type PinnedRule, withoutAccessKey } from "./rules";

/*
 * A Chrome count, taken as `source-order.md` says the glossary and the
 * sidecars cite one: N is Chrome's messages whose English has the term, by the
 * pin's `countEnglish`, its `msgidPattern` or its `msgid` as a whole word, and
 * n those of them whose translation matches the pin's `countExpect` or its
 * `expect` without its anchors. Both sides are read without their access keys,
 * since `&` can split a word, unless the pin or the caller keeps them to tell a
 * menu item such as `&Edit` from a plain Edit, ignoring case unless told
 * otherwise, and with
 * Chrome's straight apostrophe as the curly one the style sheets write. A
 * ban's count is the messages whose translation has the banned form, as Chrome
 * writes it.
 */

export type Count = { n: number; total: number; matched: Pair[] };

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function withoutAnchors(pattern: string) {
  return pattern.replace(/^\^/u, "").replace(/(?<!\\)\$$/u, "");
}

export function englishOf(
  rule: Pick<PinnedRule, "msgid" | "msgidPattern" | "countEnglish">,
  flags = "iu",
) {
  const pattern =
    rule.countEnglish ??
    rule.msgidPattern ??
    `(?<![\\p{L}\\p{N}])${escape(rule.msgid ?? "")}(?![\\p{L}\\p{N}])`;

  return new RegExp(pattern, flags);
}

const straightApostrophes = (text: string) => text.replaceAll("’", "'");

export function chromeCount(
  pairs: Pair[],
  english: RegExp,
  expect: RegExp,
  keepAccessKeys = false,
): Count {
  const read = keepAccessKeys ? (text: string) => text : withoutAccessKey;

  const matched = pairs.filter(([source]) => english.test(read(source)));

  const translated = new RegExp(straightApostrophes(expect.source), expect.flags);

  return {
    n: matched.filter(([, translation]) => translated.test(straightApostrophes(read(translation))))
      .length,
    total: matched.length,
    matched,
  };
}

export function pinCount(
  rule: PinnedRule,
  pairs: Pair[],
  override: { english?: string; caseSensitive?: boolean; keepAccessKeys?: boolean } = {},
) {
  const flags = override.caseSensitive ? "u" : "iu";

  return chromeCount(
    pairs,
    override.english === undefined ? englishOf(rule, flags) : new RegExp(override.english, flags),
    new RegExp(rule.countExpect ?? withoutAnchors(rule.expect), flags),
    override.keepAccessKeys ?? rule.countKeepAccessKeys ?? false,
  );
}

export function banCount(rule: BannedRule, pairs: Pair[]) {
  const banned = new RegExp(rule.pattern, "u");

  return pairs.filter(([, translation]) => banned.test(translation)).length;
}

/** The count a rule's reason cites, in any of the forms the sidecars write it. */
export function citedCount(reason: string) {
  const pin =
    /Chrome:? (\d+) of (\d+) messages/u.exec(reason) ??
    /Chrome in (\d+) of (\d+) messages/u.exec(reason) ??
    /Chrome (\d+)\/(\d+)/u.exec(reason);

  if (pin) {
    return { n: Number(pin[1]), total: Number(pin[2]) };
  }

  const ban = /Chrome writes the banned form in (none of its|\d+) messages?/u.exec(reason);

  return ban ? { n: ban[1] === "none of its" ? 0 : Number(ban[1]) } : undefined;
}

export type CountLine = { text: string; differs: boolean; count?: Count };

/** Each pin's and ban's line as `count.ts <tag>` prints it, and whether its cited count differs. */
export function countLines(
  tag: string,
  sidecar: { pinned: PinnedRule[]; banned: BannedRule[] },
  pairs: Pair[],
  options: {
    ids?: string[];
    english?: string;
    caseSensitive?: boolean;
    keepAccessKeys?: boolean;
  } = {},
): CountLine[] {
  const named = (id: string) => !options.ids?.length || options.ids.includes(id);

  const pins = sidecar.pinned
    .filter(({ id }) => named(id))
    .map((rule): CountLine => {
      const count = pinCount(rule, pairs, options);

      const cited = citedCount(rule.reason);

      const citedText =
        cited?.total === undefined ? "cites none" : `cites ${cited.n}/${cited.total}`;

      const differs =
        cited?.total !== undefined && (cited.total !== count.total || cited.n !== count.n);

      return {
        text: `${tag} pinned:${rule.id}: Chrome ${count.n}/${count.total}, ${citedText}${differs ? " (differs)" : ""}`,
        differs,
        count,
      };
    });

  const bans = sidecar.banned
    .filter(({ id }) => named(id))
    .map((rule): CountLine => {
      const n = banCount(rule, pairs);

      const cited = citedCount(rule.reason);

      const citedText = cited === undefined ? "cites none" : `cites ${cited.n}`;

      const differs = cited !== undefined && cited.n !== n;

      return {
        text: `${tag} banned:${rule.id}: Chrome writes it in ${n}, ${citedText}${differs ? " (differs)" : ""}`,
        differs,
      };
    });

  return [...pins, ...bans];
}

const USAGE = `Usage: bun .claude/skills/translate/count.ts <tag> [<rule id>…] [--english <regex>] [--expect <regex>] [--case] [--keep-access-keys] [--show] [--check]
       bun .claude/skills/translate/count.ts <tag> --source <name> --english <regex> --expect <regex> [--case] [--show]

Counts Chrome's messages for each pin or ban of languages/<tag>.json named, or
every one without ids, in .cache/translate/corpus/chrome.<tag>.jsonl, which
corpus.ts --source chrome <tag> writes, and prints each beside the count its
reason cites. --english counts a pin by the Chrome term its word comes from
rather than its countEnglish or msgidPattern; with --expect and no rule id, it
counts an ad hoc term. --case counts case-sensitively. --keep-access-keys
reads both sides with their & access keys, as a pin's countKeepAccessKeys
does, to tell a menu item such as &Edit from a plain Edit. --show lists the
messages a pin's count matched. --check exits 1 when any count printed
differs from the one its reason cites. --source counts an ad hoc term in
another corpus, such as gnome for a Linux platform word; pins and bans cite
Chrome alone.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      english: { type: "string" },
      expect: { type: "string" },
      case: { type: "boolean" },
      "keep-access-keys": { type: "boolean" },
      show: { type: "boolean" },
      check: { type: "boolean" },
      source: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [tag, ...ids] = positionals;

  if (values.help || !tag) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const source = (values.source ?? "chrome") as Source;

  const adHoc = ids.length === 0 && values.english !== undefined && values.expect !== undefined;

  if (!SOURCES.includes(source) || (source !== "chrome" && !adHoc)) {
    console.error(
      SOURCES.includes(source)
        ? "--source other than chrome counts an ad hoc term: give --english and --expect, and no rule id."
        : `Unknown source ${source}; use ${SOURCES.join(", ")}.`,
    );

    process.exit(2);
  }

  const name = SOURCE_NAMES[source];

  const pairs = await readCorpus(CORPUS_DIR, source, tag);

  if (pairs.length === 0) {
    console.error(
      `No ${name} corpus for ${tag}; run bun .claude/skills/translate/corpus.ts --source ${source} ${tag}`,
    );

    process.exit(2);
  }

  const show = (count: Count) => {
    if (values.show) {
      for (const [english, translation] of count.matched) {
        console.log(`    ${english} => ${translation}`);
      }
    }
  };

  if (adHoc) {
    const flags = values.case ? "u" : "iu";

    const count = chromeCount(
      pairs,
      new RegExp(values.english as string, flags),
      new RegExp(values.expect as string, flags),
      values["keep-access-keys"],
    );

    console.log(
      `${tag} /${values.english}/ → /${values.expect}/: ${name} ${count.n}/${count.total}`,
    );

    show(count);

    return;
  }

  const lines = countLines(tag, await loadSidecar(tag), pairs, {
    ids,
    english: values.english,
    caseSensitive: values.case,
    keepAccessKeys: values["keep-access-keys"],
  });

  for (const { text, count } of lines) {
    console.log(text);

    if (count) {
      show(count);
    }
  }

  if (values.check && lines.some(({ differs }) => differs)) {
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`count.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
