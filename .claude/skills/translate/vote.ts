import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { APP_NAMES, APPS, type App, CORPUS_DIR, type Pair, readCorpus } from "./corpus";

/*
 * The seven-app vote of the source order's step 4c, over the corpora
 * `corpus.ts` writes. Each concept in `vote-concepts.json` names Meru's sense
 * in English and each language's candidate words: in every app, each distinct
 * message whose English has the concept counts once, for the candidate it
 * matches longest, and the app votes for the candidate it uses most; the word
 * with most votes wins, cited as the glossary cites it.
 */

export const CONCEPTS_PATH = path.join(import.meta.dir, "vote-concepts.json");

const concept = z
  .object({
    concept: z.string(),
    english: z.string(),
    // English that has the concept's word in another sense, such as toast the bread.
    englishNot: z.string().optional(),
    candidates: z.record(z.string(), z.record(z.string(), z.string())),
    // Words another of Meru's concepts uses in that language, which are out of the vote.
    exclude: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();

export type Concept = z.infer<typeof concept>;

export const conceptsSchema = z.array(concept);

/*
 * `\b` reads letters with accents and kana as word characters, so `\bavis\b`
 * never matches inside avisé, which JavaScript's ASCII `\b` would.
 */
export function pattern(source: string) {
  const word = "[\\p{L}\\p{N}_]";

  return new RegExp(
    source.replace(/\\b/gu, `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`),
    "iu",
  );
}

export type AppVote = { word: string } | { tie: string[] };

export type VoteResult = {
  status: "ok" | "tie" | "fewer than 3 apps" | "no vote";
  winner: string | undefined;
  cite: string;
  votes: Partial<Record<App, AppVote>>;
  messages: Partial<Record<App, { total: number; counts: Record<string, number> }>>;
};

/** Words by count, most first, a tie keeping the order the words were first counted in. */
function ranked(counts: Map<string, number>) {
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function vote(
  item: Concept,
  tag: string,
  corpora: Partial<Record<App, Pair[]>>,
): VoteResult {
  const english = pattern(item.english);

  const englishNot = item.englishNot === undefined ? undefined : pattern(item.englishNot);

  const candidates = Object.entries(item.candidates[tag] ?? {}).map(
    ([word, source]) => [word, pattern(source)] as const,
  );

  const excluded = new Set(item.exclude?.[tag] ?? []);

  const votes: VoteResult["votes"] = {};

  const messages: VoteResult["messages"] = {};

  for (const app of APPS) {
    const seen = new Set<string>();

    const hits = (corpora[app] ?? []).filter(([source, translation]) => {
      const key = `${source}\u0000${translation}`;

      if (seen.has(key) || !english.test(source) || englishNot?.test(source)) {
        return false;
      }

      seen.add(key);

      return true;
    });

    const counts = new Map<string, number>();

    for (const [, translation] of hits) {
      let best: { length: number; word: string } | undefined;

      for (const [word, regex] of candidates) {
        const length = regex.exec(translation)?.[0].length;

        if (
          length !== undefined &&
          (!best || length > best.length || (length === best.length && word > best.word))
        ) {
          best = { length, word };
        }
      }

      if (best && !excluded.has(best.word)) {
        counts.set(best.word, (counts.get(best.word) ?? 0) + 1);
      }
    }

    const order = ranked(counts);

    messages[app] = { total: hits.length, counts: Object.fromEntries(order) };

    const [first, second] = order;

    if (!first) {
      continue;
    }

    votes[app] =
      second && second[1] === first[1]
        ? { tie: order.filter(([, n]) => n === first[1]).map(([word]) => word) }
        : { word: first[0] };
  }

  const tally = new Map<string, number>();

  for (const app of APPS) {
    const appVote = votes[app];

    if (appVote && "word" in appVote) {
      tally.set(appVote.word, (tally.get(appVote.word) ?? 0) + 1);
    }
  }

  const [top, runnerUp] = ranked(tally);

  const status: VoteResult["status"] =
    Object.keys(votes).length < 3
      ? "fewer than 3 apps"
      : top && runnerUp && top[1] === runnerUp[1]
        ? "tie"
        : top
          ? "ok"
          : "no vote";

  const voters = APPS.filter((app) => {
    const appVote = votes[app];

    return appVote && "word" in appVote && appVote.word === top?.[0];
  }).map((app) => APP_NAMES[app]);

  return {
    status,
    winner: top?.[0],
    cite: top ? `${top[0]}: ${top[1]} of 7 (${voters.join(", ")})` : "",
    votes,
    messages,
  };
}

export function formatVotes(votes: VoteResult["votes"]) {
  return APPS.flatMap((app) => {
    const appVote = votes[app];

    if (!appVote) {
      return [];
    }

    return [
      `${APP_NAMES[app]}=${"word" in appVote ? appVote.word : `tie ${appVote.tie.join("/")}`}`,
    ];
  }).join("; ");
}

const USAGE = `Usage: bun .claude/skills/translate/vote.ts [--concepts <file>] [--corpus <dir>] [--detail] <tag>… [-- <concept>…]

Runs the seven-app vote for every concept of vote-concepts.json, or those
named after --, in each language given, over the corpora corpus.ts writes
to .cache/translate/corpus. Prints each result as the glossary cites it, with
its status and every app's vote; --detail adds each app's message counts.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      concepts: { type: "string" },
      corpus: { type: "string" },
      detail: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const split = process.argv.indexOf("--");

  const named = split === -1 ? [] : process.argv.slice(split + 1);

  const tags = positionals.filter((positional) => !named.includes(positional));

  if (values.help || tags.length === 0) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const concepts = conceptsSchema
    .parse(await Bun.file(values.concepts ?? CONCEPTS_PATH).json())
    .filter((item) => named.length === 0 || named.includes(item.concept));

  const dir = values.corpus ?? CORPUS_DIR;

  for (const tag of tags) {
    const corpora: Record<App, Pair[]> = Object.fromEntries(
      await Promise.all(APPS.map(async (app) => [app, await readCorpus(dir, app, tag)] as const)),
    ) as Record<App, Pair[]>;

    const missing = APPS.filter((app) => corpora[app].length === 0);

    if (missing.length > 0) {
      console.error(`${tag}: no corpus for ${missing.join(", ")}; corpus.ts ${tag} builds them.`);
    }

    for (const item of concepts.filter((candidate) => candidate.candidates[tag])) {
      const result = vote(item, tag, corpora);

      console.log(
        `${item.concept} | ${tag} | ${result.status} | ${result.cite} | ${formatVotes(result.votes)}`,
      );

      if (values.detail) {
        for (const app of APPS) {
          const detail = result.messages[app];

          console.log(
            `    ${APP_NAMES[app]}: ${detail?.total ?? 0} messages ${JSON.stringify(detail?.counts ?? {})}`,
          );
        }
      }
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`vote.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
