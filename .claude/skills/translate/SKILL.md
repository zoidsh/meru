---
name: translate
description: Translate Meru's interface strings into every shipped language, with a translator and a reviewer agent per locale. Use after wrapping or changing a user-visible string, when CI's catalog checks report untranslated entries, or when asked to translate the catalogs.
---

# Translate

Fills every shipped locale's untranslated and fuzzy entries in both catalogs, `packages/shared/i18n/locales/<tag>.po` and `packages/preload-gmail/locales/<tag>.po`, then runs the checks CI runs. Each locale gets its own `translator` agent, which writes the translations, and its own `translation-reviewer` agent, which checks them; a locale no person reviews also gets a `translation-second-reviewer`, a cold second pass. All three are in `.claude/agents`. Their guidance is beside this file: `glossary.md` and `languages/<tag>.md`.

**Human-reviewed languages: `de`.** A person reads the doubtful and style findings of these. Every other locale is reviewed by agents alone, so step 4 has the translator apply those findings itself and adds the second pass.

## Where a word comes from

Every word in every language comes from the first of these sources that has it, and the glossary, the style sheets and the sidecars say which:

1. The operating system's own words, meaning its labels (File, Paste, Quit, Save As…) and the names of its parts (menu bar, Dock, Finder, System Settings, Do Not Disturb, system tray), come from the platform showing them: Apple on macOS, Microsoft on Windows, GNOME on Linux.
2. Gmail's own terms take Gmail's word in that language.
3. Google's names take Google's word; the Workspace apps' names stay English.
4. Meru's own copy takes, in order:
   1. (4a) Chrome's word where Chrome has the term;
   2. (4b) a recorded call of the user's, which overrides Chrome only as a named exception with its reason; there are none now;
   3. (4c) otherwise the word most commonly used for that concept in popular apps in that language, counted across a fixed set with one vote each: Thunderbird, Firefox (Mozilla's l10n repositories), VS Code (`microsoft/vscode-loc`), Android (AOSP's `values-<lang>/strings.xml` of core apps such as Settings, SystemUI, Messaging and Email), LibreOffice (its translations repository), the Microsoft Terminology Collection (the TBX) and Apple's macOS apps (this Mac's `.loctable`s; one vote, counted as an app, not as an authority). Each app's vote is the word it uses most for the concept; the word with most votes wins, marked `agent-chosen` with its tally, such as _Hinweis: 4 of 7 (Thunderbird, Firefox, Android, Microsoft)_. When the vote ties, or fewer than 3 of the 7 have the concept, Google's own wording for the same concept breaks it (Gmail, Google One, Google Workspace, Google Calendar or Chrome Help, with `hl=<tag>`), and failing that the existing word stays, marked unresolved with each app's word, for a speaker to settle.

Apple is never the authority for a word in Meru's own copy; its macOS apps are one vote of seven in step 4c. Grammar is not a word: address form, capitalization, label form, punctuation and the ellipsis follow Apple's conventions for each language, as its style sheet says. A rule backed by Chrome or by a call of the user's is `wrong` in every sidecar; An agent-chosen word is `wrong` too, since the glossary is the decision and nobody reads the doubtful findings of most languages; `doubtful` is for a heuristic a person should judge. The glossary's opening section says how each source is cited.

## Before you start

- `CLAUDE_CODE_EFFORT_LEVEL` overrides the `effort` in the agents' frontmatter, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` their `model`. Run `printenv CLAUDE_CODE_EFFORT_LEVEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE`; if either prints a value, stop and tell the user to start the session again without it, such as `env -u CLAUDE_CODE_EFFORT_LEVEL claude`.
- Never pass `model` or `effort` when spawning any of the agents, which would override the frontmatter too.
- Read `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`. When it holds `en` alone, say there is nothing to translate, since English is the source, and stop.
- `<scratchpad>` below is the session's scratchpad directory, never `/tmp`. A headless session, such as `claude -p`, may have none: then create one with `mktemp -d "$TMPDIR/translate.XXXXXX"`, use it for the whole run and print its path in the report. Never look for one in other sessions' folders.

## 1. Extract

Run `bun run i18n:extract`, so each catalog holds every string in the code.

## 2. Collect the entries

Run `bun .claude/skills/translate/collect.ts --base origin/<base> --out <scratchpad>/translate`, where `<base>` is the branch the work will merge into: the pull request's base from `gh pr view --json baseRefName -q .baseRefName` when there is one, else `beta`. It writes, for every shipped locale except `en` with work to do, `<tag>.txt`, each untranslated or fuzzy entry across both catalogs with its `msgctxt`, its `#.` comments and its origin, and beside it `<tag>.glossary.md`, the glossary with only that locale's words. It prints the paths of both. When it warns that it skipped glossary lines, give translators and reviewers the full `glossary.md` as well as the slice, and say so in the report.

When the English of an entry changed, Lingui made it a new entry and kept the old one as obsolete, or dropped it once `--clean` ran. The script looks for the old entry in the catalog's obsolete entries, in the catalog at `HEAD` and at the merge base with `<base>`, pairing each with the closest English in the same context, where a shared comment only breaks a tie, and never giving one old entry to two new ones. It prints the old translation as `prior art`, and warns on stderr when `--base` doesn't resolve. Check that each pairing is really the same string reworded, by searching the entry files for `prior art` rather than reading them whole; drop one that isn't.

If it prints `Nothing to translate`, go to step 5.

## 3. Translate, one agent per locale

Spawn one `translator` per locale with entries, all in one message so they run in parallel. Each prompt carries:

- the locale tag, and the paths of its style sheet `.claude/skills/translate/languages/<tag>.md`, whose JSON sidecar `languages/<tag>.json` sits beside it, of its glossary slice `<tag>.glossary.md` and of its two PO files;
- the path of its entry file `<tag>.txt`, never the entries pasted into the prompt;
- that it looks up Lingui syntax in the Markdown copy of a docs page, the page URL with `.md` appended, such as https://lingui.dev/ref/macro.md, rather than guess.

Keep each translator's agent ID; the review sends its findings back to the same agent.

## 4. Review, then fix, at most twice

As each translator returns, prepare that locale's review in the same scratch directory, `<scratchpad>/translate`:

1. Run `bun .claude/skills/translate/check.ts --locale <tag> > <scratchpad>/translate/<tag>.check.json`. It exits 1 when a finding is `wrong`, which is a result, not a failure; exit 2 is a crash, which you report rather than review around.
2. Run `bun .claude/skills/translate/collect.ts --dump <tag> --out <scratchpad>/translate`, which writes `<tag>.dump.txt`, both catalogs grouped by the file each entry comes from.

Then spawn one `translation-reviewer` for that locale. Its prompt carries the locale tag, the same instruction about Lingui's Markdown docs, and these paths, never their contents:

- the entry file `<tag>.txt`, the entries it reviews in full;
- the dump `<tag>.dump.txt`, which it reads for consistency;
- the `check.ts` report `<tag>.check.json`;
- the style sheet `languages/<tag>.md`, its sidecar `languages/<tag>.json` and the glossary slice `<tag>.glossary.md`, plus `glossary.md` when step 2 warned about skipped lines;
- the output path `<scratchpad>/translate/<tag>.review.json`, where it writes its findings.

Keep its agent ID too. Its findings come in three tiers. Only `wrong` enters the fix loop. For a human-reviewed locale, `doubtful` and `style` go to the report as the review set a person reads; for any other locale, the translator applies them after the loop, as [below](#a-locale-no-person-reviews).

- A reviewer whose reply ends `PASS: <tag>` and whose `check.ts` report has no `wrong` finding it left standing closes that locale.
- Otherwise, build one fix list: the `check.ts` findings of severity `wrong` the reviewer didn't dismiss, plus the `wrong` findings in `<tag>.review.json`, each with its msgid, msgctxt, catalog, reason and suggestion. `check.ts` gives `catalog` as the PO file's path, so write it as the name `--apply` takes: `app` for `packages/shared/i18n/locales/<tag>.po`, `preload-gmail` for `packages/preload-gmail/locales/<tag>.po`. Continue the same translator with `SendMessage` to its agent ID, passing the list, so it keeps its context. Then run `check.ts` again into the same file, and continue the same reviewer with `SendMessage` to re-review only the entries on the list, naming the new report.
- Stop after two rounds of fixes. A `wrong` finding still open then goes to the report, with the reviewer's text and the translator's answer; it is never forced through by editing the catalog yourself.
- A `check.ts` finding the reviewer dismissed goes to the report with the reviewer's reason, since a false positive points at a sidecar rule to fix.

Never ask the reviewer to rule on anything else. The translator's own unsure choices, listed in its reply, go to the report for the user, and so do product questions from either agent, such as how a platform behaves or whether a label needs an access key: anything that isn't wording.

If `SendMessage` is unavailable, spawn a new agent of the same type instead, giving it the original prompt plus the fix list and the translator's previous reply. A new `translation-second-reviewer` gets its original prompt and the fix list only, never the translator's reply, so it stays cold.

### A locale no person reviews

For a locale not on the human-reviewed list, once the loop above has closed it or reached its cap:

1. **Apply suggestions.** Continue the translator with `SendMessage`, passing the path of `<tag>.review.json` and telling it to apply its doubtful and style findings. It applies every one that carries a `suggestion` unless it disagrees, and says why for each it leaves. A finding whose `msgstr` no longer matches the entry's translation was written before a fix in the loop; the translator skips it or merges it by hand, never writing the suggestion over the fix, and says so. Then run `check.ts` again into `<tag>.check.json`; a `wrong` finding there goes back to the translator as one fix, outside the round count, since it comes from a suggestion rather than a review.
2. **Second pass.** Run `bun .claude/skills/translate/collect.ts --dump <tag> --out <scratchpad>/translate` again, so the dump holds the catalogs as they now stand, and spawn one `translation-second-reviewer` for the locale. It is cold: its prompt carries the locale tag, the Lingui docs instruction and only these paths, never `<tag>.review.json`, `<tag>.check.json` or anything the translator said:
   - the dump `<tag>.dump.txt`;
   - the style sheet `languages/<tag>.md` and its sidecar `languages/<tag>.json`;
   - the glossary slice `<tag>.glossary.md`, plus `glossary.md` when step 2 warned about skipped lines;
   - the output path `<scratchpad>/translate/<tag>.second-review.json`.

   It reads the source itself, by each entry's origin.

3. **One more fix round.** When `<tag>.second-review.json` has `wrong` findings, send them to the translator as a fix list, built as in the loop above, run `check.ts` again, and continue the second reviewer with `SendMessage` to re-review only those entries against a fresh dump. That is the only round: a `wrong` finding still open after it goes to the report, as in the loop above. The second pass's doubtful and style findings go to the report.

For a human-reviewed locale, nothing here runs: its doubtful and style findings stay for the person. The user can ask for the second pass on one too; then run step 2 and step 3 alone.

## 5. Check

Run, in this order, CI's checks and then the rules check for each shipped locale except `en`:

```sh
bun run i18n:extract
bunx lingui check sync --clean --workers 1
bunx lingui check missing --mode catalog --verbose --workers 1
bun run i18n:check
bunx lingui compile --strict
bun .claude/skills/translate/check.ts --locale <tag>
```

The first drops the obsolete entries the translators used as prior art. A failure names its entry and locale, and so does a `wrong` finding from `check.ts`, which fails the run the same way: send it to that locale's translator as one more finding, then run the checks again. If it still fails, report it rather than retry. A `check.ts` exit of 2 is a crash; report it, never retry it. Two `wrong` findings from `check.ts` don't go to a translator: one the reviewer dismissed in step 4 doesn't fail the run and stays in the report's dismissed list, since it points at a sidecar rule to fix; one in a locale no translator worked on this run goes straight to the report.

## 6. Report

Per locale, say:

- how many entries were translated, how many review rounds they took, and the `wrong` findings fixed and still open, each open one with its msgid, the problem, the suggested fix and the translator's answer;
- the counts of `doubtful` and `style` findings, and the path of `<tag>.review.json` that holds them;
- for a locale no person reviews: how many suggestions the translator applied, each one it left with its reason, the second pass's counts by severity with the path of `<tag>.second-review.json`, its `wrong` findings fixed and still open, and its doubtful and style findings, each with its msgid, reason and suggestion;
- the translator's unsure choices, as its reply lists them, and the product questions from either agent;
- each `check.ts` finding the reviewer dismissed, with its reason;
- every term a translator chose that the glossary lacks, so it can be added to `glossary.md`.

Say that the `<tag>.review.json` files of the human-reviewed locales are the human review set: the reviewer's doubtful and style findings, which no agent has fixed. Say that the second pass can run for those locales too, if the user asks. Then show the output of the checks in step 5.

Leave the catalogs uncommitted: the translations land in the same commit as the strings they translate.

## Adding a language

A language ships once it is in seven places:

1. `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`, which `lingui.config.ts` reads as its locales.
2. The `catalogs` record in `packages/shared/i18n/index.ts`, importing `messages` from `./locales/<tag>`.
3. The dayjs locale import in `packages/renderer/lib/date.ts`, `dayjs/locale/<name>` with the name `getDayjsLocale` gives the tag, such as `es-mx` for `es-419`.
4. The `catalogs` record in `packages/preload-gmail/i18n.ts`, importing from its own `./locales/<tag>`.
5. The style sheet `.claude/skills/translate/languages/<tag>.md`, its words taken by the [source order](#where-a-word-comes-from), and the language's line in every glossary entry.
6. The sidecar `languages/<tag>.json`, which `check.ts` needs to run at all: the Platform words table's rows, the banned words, the pinned terms and the access-key style. `scripts/translate-rules.test.ts` holds its platform words to the style sheet's table.
7. The fixtures `fixtures/<tag>-clean.po`, the wording every rule allows, and `fixtures/<tag>-faults.po`, a planted fault for each rule, marked `# fault: <rule>:<id>`. `scripts/translate-check.test.ts` fails for a sidecar with rules and no fixtures, and for a fixture whose findings differ from what it plants.

Edit the tags first and run `bun run i18n:extract` before adding the two catalog imports: `i18n:compile` makes the `.ts` modules those imports name from the locale's `.po` files, and only extract creates those. Run `bun test --isolate scripts/translate-*.test.ts` once the sidecar and fixtures are in. Then run this skill to translate the new catalogs.

## Changing a rule

A decision recorded in a sidecar, `languages/<tag>.json`, is encoded in `check.ts`'s fixtures as well: `fixtures/<tag>-clean.po` holds the wording it allows and `fixtures/<tag>-faults.po` a planted fault for each rule, which `scripts/translate-check.test.ts` holds the rules against. Changing a decision means changing the style sheet, the glossary, the sidecar and the fixtures together, then running `bun test --isolate scripts/translate-*.test.ts`.
