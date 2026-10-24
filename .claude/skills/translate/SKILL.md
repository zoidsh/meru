---
name: translate
description: Translate Meru's interface strings into every shipped language, with a translator and a reviewer agent per locale. Use after wrapping or changing a user-visible string, when CI's catalog checks report untranslated entries, or when asked to translate the catalogs.
---

# Translate

Fills every shipped locale's untranslated and fuzzy entries in both catalogs, `packages/shared/i18n/locales/<tag>.po` and `packages/preload-gmail/locales/<tag>.po`, then runs the checks CI runs. Each locale gets its own `translator` agent, which writes the translations, and its own `translation-reviewer` agent, which checks them; both are in `.claude/agents`. Their guidance is beside this file: `glossary.md` and `languages/<tag>.md`.

## Before you start

- `CLAUDE_CODE_EFFORT_LEVEL` overrides the `effort` in the agents' frontmatter, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` their `model`. Run `printenv CLAUDE_CODE_EFFORT_LEVEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE`; if either prints a value, stop and tell the user to start the session again without it, such as `env -u CLAUDE_CODE_EFFORT_LEVEL claude`.
- Never pass `model` or `effort` when spawning either agent, which would override the frontmatter too.
- Read `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`. When it holds `en` alone, say there is nothing to translate, since English is the source, and stop.

## 1. Extract

Run `bun run i18n:extract`, so each catalog holds every string in the code.

## 2. Collect the entries

Run `bun .claude/skills/translate/collect.ts --base origin/<base> --out <scratchpad>/translate`, where `<base>` is the branch the work will merge into: the pull request's base from `gh pr view --json baseRefName -q .baseRefName` when there is one, else `beta`, and `<scratchpad>` is the session's scratchpad directory, never `/tmp`. It writes, for every shipped locale except `en` with work to do, `<tag>.txt`, each untranslated or fuzzy entry across both catalogs with its `msgctxt`, its `#.` comments and its origin, and beside it `<tag>.glossary.md`, the glossary with only that locale's words. It prints the paths of both. When it warns that it skipped glossary lines, give translators and reviewers the full `glossary.md` as well as the slice, and say so in the report.

When the English of an entry changed, Lingui made it a new entry and kept the old one as obsolete, or dropped it once `--clean` ran. The script looks for the old entry in the catalog's obsolete entries, in the catalog at `HEAD` and at the merge base with `<base>`, pairing each with the closest English in the same context, where a shared comment only breaks a tie, and never giving one old entry to two new ones. It prints the old translation as `prior art`, and warns on stderr when `--base` doesn't resolve. Check that each pairing is really the same string reworded, by searching the entry files for `prior art` rather than reading them whole; drop one that isn't.

If it prints `Nothing to translate`, go to step 5.

## 3. Translate, one agent per locale

Spawn one `translator` per locale with entries, all in one message so they run in parallel. Each prompt carries:

- the locale tag, and the paths of its style sheet `.claude/skills/translate/languages/<tag>.md`, whose JSON sidecar `languages/<tag>.json` sits beside it, of its glossary slice `<tag>.glossary.md` and of its two PO files;
- the path of its entry file `<tag>.txt`, never the entries pasted into the prompt;
- that it looks up Lingui syntax in the Markdown copy of a docs page, the page URL with `.md` appended, such as https://lingui.dev/ref/macro.md, rather than guess.

Keep each translator's agent ID; the review sends its findings back to the same agent.

## 4. Review, then fix, at most twice

As each translator returns, spawn one `translation-reviewer` for that locale, giving it the locale tag, the path of the same entry file, the style sheet, glossary and PO paths, and the same instruction about Lingui's Markdown docs. Keep its agent ID too.

- A reviewer that replies `PASS: <tag>` closes that locale.
- Otherwise, continue the same translator with `SendMessage` to its agent ID, passing the findings verbatim, so it keeps its context. Then continue the same reviewer with `SendMessage` to re-review those entries.
- Stop after two rounds of fixes. A finding still open then is reported to the user in the summary, with the reviewer's text and the translator's answer; it is never forced through by editing the catalog yourself.

If `SendMessage` is unavailable, spawn a new agent of the same type instead, giving it the original prompt plus the findings and the translator's previous reply.

## 5. Check

Run, in this order, as CI does:

```sh
bun run i18n:extract
bunx lingui check sync --clean --workers 1
bunx lingui check missing --mode catalog --verbose --workers 1
bun run i18n:check
bunx lingui compile --strict
```

The first drops the obsolete entries the translators used as prior art. A failure names its entry and locale: send it to that locale's translator as one more finding, then run the checks again. If it still fails, report it rather than retry.

## 6. Report

Say, per locale, how many entries were translated, how many review rounds they took, and every finding still open, with its msgid, the problem and the suggested fix. Name any term a translator chose that the glossary lacks, so it can be added to `glossary.md`. Then show the output of the five checks.

Leave the catalogs uncommitted: the translations land in the same commit as the strings they translate.

## Adding a language

A language ships once it is in five places:

1. `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`, which `lingui.config.ts` reads as its locales.
2. The `catalogs` record in `packages/shared/i18n/index.ts`, importing `messages` from `./locales/<tag>`.
3. The dayjs locale import in `packages/renderer/lib/date.ts`, `dayjs/locale/<name>` with the name `getDayjsLocale` gives the tag, such as `es-mx` for `es-419`.
4. The `catalogs` record in `packages/preload-gmail/i18n.ts`, importing from its own `./locales/<tag>`.
5. The style sheet `.claude/skills/translate/languages/<tag>.md`.

Edit the tags first and run `bun run i18n:extract` before adding the two catalog imports: extract writes the new locale's `.po` files, which `i18n:compile` turns into the `.ts` modules those imports name, so without them the compiled catalog doesn't exist and `bun run types` fails. Then run this skill to translate the new catalogs.
