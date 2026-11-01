---
name: translate
description: Translate Meru's interface strings into every shipped language, with a translator, a reviewer and an MQM reviewer agent per locale. Use after wrapping or changing a user-visible string, when CI's catalog checks report untranslated entries, or when asked to translate the catalogs.
---

# Translate

Fills every shipped locale's untranslated and fuzzy entries in both catalogs, `packages/shared/i18n/locales/<tag>.po` and `packages/preload-gmail/locales/<tag>.po`, then runs the checks CI runs. Each locale gets its own `translator` agent, which writes the translations, its own `translation-reviewer` agent, which checks them, and, as the final step, a fresh `translation-mqm-reviewer` agent, which assesses the result with MQM for `mqm.ts` to score and gate. All three are in `.claude/agents`. Their guidance is beside this file: `glossary.md` and `languages/<tag>.md`.

## Where a word comes from

Every word in every language comes from the first source in the order [source-order.md](source-order.md) gives, from the operating system's own words to the seven-app vote, and the glossary, the style sheets and the sidecars cite which. Read it before ruling on a word.

A Chrome count or a seven-app vote is frozen once a glossary entry or a sidecar reason cites it: recount only when a rule is disputed, when an Electron upgrade changes Chromium's wording for the term, or when a change to the counting scripts changes what they count. [counting.md](counting.md) says how to take one again with `corpus.ts`, `count.ts` and `vote.ts`.

## Before you start

- `CLAUDE_CODE_EFFORT_LEVEL` overrides the `effort` in the agents' frontmatter, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` their `model`. Run `printenv CLAUDE_CODE_EFFORT_LEVEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE`; if either prints a value, stop and tell the user to start the session again without it, such as `env -u CLAUDE_CODE_EFFORT_LEVEL claude`.
- Never pass `model` or `effort` when spawning any of the agents, which would override the frontmatter too.
- `claude -p` stops waiting for agents still running in the background once `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` has passed, and `0` lifts that ceiling, so a headless run without it can exit with its agents unfinished. In a headless session, run `printenv CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`; if it prints anything but `0`, stop and tell the user to rerun as `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE claude -p "/translate" --permission-mode bypassPermissions`, the command a headless run always takes.
- Read `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`. When it holds `en` alone, say there is nothing to translate, since English is the source, and stop.
- `<scratchpad>` below is the session's scratchpad directory, never `/tmp`. A headless session, such as `claude -p`, may have none: then create one with `mktemp -d "$TMPDIR/translate.XXXXXX"`, use it for the whole run and print its path in the report. Never look for one in other sessions' folders.

## 1. Extract

Run `bun run i18n:extract`, so each catalog holds every string in the code.

## 2. Collect the entries

Run `bun .claude/skills/translate/collect.ts --base <base> --out <scratchpad>/translate`, where `<base>` is the name of the branch the work will merge into: the pull request's base from `gh pr view --json baseRefName -q .baseRefName` when there is one, else `beta`, which is also the default when `--base` is left out. The changes it compares against start at the branch's own merge base with `<base>`: of `<base>` and `origin/<base>`, the script takes whichever merge base is nearer `HEAD`, so a worktree rebased onto a local `<base>` newer than the last fetch, or onto a fresh fetch past a stale local branch, never counts the target's own commits as its changes. Pass the branch name, not a commit, and never fetch or rebase during the run, which would move the base between step 2 and step 6. It writes, for every shipped locale except `en` with work to do, `<tag>.txt`, each untranslated or fuzzy entry across both catalogs with its `msgctxt`, its `#.` comments and its origin, and beside it `<tag>.glossary.md`, the glossary with only that locale's words. It prints the paths of both. When it warns that it skipped glossary lines, give translators and reviewers the full `glossary.md` as well as the slice, and say so in the report.

When the English of an entry changed, Lingui made it a new entry and kept the old one as obsolete, or dropped it once `--clean` ran. The script looks for the old entry in the catalog's obsolete entries, in the catalog at `HEAD` and at the merge base with `<base>`, pairing each with the closest English in the same context, where a shared comment only breaks a tie, and never giving one old entry to two new ones. It prints the old translation as `prior art`, and warns on stderr when `--base` doesn't resolve. Check that each pairing is really the same string reworded, by searching the entry files for `prior art` rather than reading them whole; drop one that isn't.

It decides each locale on its own. A locale with no untranslated or fuzzy entry gets instead every entry whose translation changed since the merge base with `<base>`, such as a hand edit or a rule fix, each with its translation then and now, in the same `<tag>.txt`. Each path line names its locale's kind, `translate` or `review`, and the script ends with a line per kind: `To translate: …`, `To review only, …: …` and `Nothing to translate or review in …`. A review-only locale skips step 3; it runs step 4 on its entry file, where a fix list goes to a new `translator` given its locale's paths and the list, since no translator ran, and then steps 5 and 6, step 6 as a partial run. A locale with nothing to translate or review needs only step 5. When `--base` doesn't resolve and a locale has nothing to translate, the script exits 2, since what changed there can't be told: fetch the base or pass another branch, and run it again, never going on without that locale's review.

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

Keep its agent ID too. Its findings come in two kinds, each with a complete `suggestion`. A `wrong` finding is a meaning or rule breach: it enters the fix loop and is reviewed again after the fix. An `improve` finding is a suggested fix the translator applies after the loop unless it disagrees, as [below](#suggested-fixes).

- A reviewer whose reply ends `PASS: <tag>` and whose `check.ts` report has no finding it left standing, whatever its severity, closes that locale.
- Otherwise, build one fix list: every `check.ts` finding the reviewer didn't dismiss, whatever its severity, since CI fails on any, plus the `wrong` findings in `<tag>.review.json`, each with its msgid, msgctxt, catalog, reason and suggestion. `check.ts` gives `catalog` as the PO file's path, so write it as the name `--apply` takes: `app` for `packages/shared/i18n/locales/<tag>.po`, `preload-gmail` for `packages/preload-gmail/locales/<tag>.po`. Continue the same translator with `SendMessage` to its agent ID, passing the list, so it keeps its context. Then run `check.ts` again into the same file, and continue the same reviewer with `SendMessage` to re-review only the entries on the list, naming the new report.
- Stop after two rounds of fixes. A finding still open then goes to the report, with the reviewer's text and the translator's answer; it is never forced through by editing the catalog yourself.
- A `check.ts` finding the reviewer dismissed is a false positive only once the sidecar says so, since CI fails on any finding left in the catalogs. Check the reviewer's reason against the sidecar and the source; when it holds, add the allowance to that rule as [Changing a rule](#changing-a-rule) says, in the same run, so `check.ts` no longer reports it, never with an exception in CI; when it doesn't, the finding goes on the fix list. Either way it goes to the report with the reviewer's reason and what you did.

Never ask the reviewer to rule on anything else. The translator's own unsure choices, listed in its reply, go to the report for the user, and so do the reviewer's doubts it had no fix for and product questions from either agent, such as how a platform behaves or whether a label needs an access key: anything that isn't wording.

If `SendMessage` is unavailable, spawn a new agent of the same type instead, giving it the original prompt plus the fix list and the translator's previous reply.

### Suggested fixes

Once the loop above has closed a locale or reached its cap, continue the translator with `SendMessage`, passing the path of `<tag>.review.json` and telling it to apply its `improve` findings. It applies every one unless it disagrees, and says why for each it leaves. A finding whose `msgstr` no longer matches the entry's translation was written before a fix in the loop; the translator skips it or merges it by hand, never writing the suggestion over the fix, and says so. Then run `check.ts` again into `<tag>.check.json`; any finding there goes back to the translator as one fix, outside the round count, since it comes from a suggestion rather than a review.

## 5. Check

Run CI's checks, in this order, the last of them the rules check of every shipped locale except `en`:

```sh
bun run i18n:extract
bunx lingui check sync --clean --workers 1
bunx lingui check missing --mode catalog --verbose --workers 1
bun run i18n:check
bunx lingui compile --strict
bun .claude/skills/translate/check.ts --shipped --strict
```

The first drops the obsolete entries the translators used as prior art. A failure names its entry and locale. The last fails on any finding, `doubtful` and `style` included, exactly as CI does, so a finding left standing fails the pull request: send it to that locale's translator as one more finding, then run the checks again. If it still fails, report it rather than retry. A `check.ts` exit of 2 is a crash; report it, never retry it. A finding the reviewer dismissed in step 4, for a reason that held, should have its allowance by now; one still reported means the allowance is missing: add it in the sidecar, `languages/<tag>.json`, and its fixtures, as [Changing a rule](#changing-a-rule) says, never with an exception in CI, and send nothing to the translator for it. A finding in a locale no translator worked on this run goes straight to the report. Say in the report what became of each.

## 6. MQM

The final step assesses each locale a translator worked on this run, every review-only locale of step 2, or one the user asks to have assessed, with MQM (Multidimensional Quality Metrics): three fresh `translation-mqm-reviewer`s each list, independently, every error with a category, a severity and a correction, and `mqm.ts` scores them. Each error costs points, minor 1, major 5 and critical 25; the score is 100 × (1 − points / source words), the words being the English's, counted as `mqm.ts` documents.

An LLM judge misses errors and varies from run to run, so every finding any run reports counts, and you rule on the serious ones instead of a vote between runs: on the [regression sets](measuring.md), a two-of-three vote dropped real catches, a major among them, and never a false positive. Findings are matched by entry (catalog, msgctxt, msgid), and an entry takes the most severe finding any run reports, with every run's finding kept beside it. A critical or major blocks the gate until you dismiss it or it is applied; every minor goes to the translator. The score is the median of the three runs' own scores, each printed beside it; it is reported and recorded, never gated on. The agent's prompt carries examples of real errors from Meru's runs, across languages, and one correct translation not to flag.

A run is full for a locale when step 2's entry file listed every entry of its catalogs, as in its first translation, or when the user asks for the whole catalog; it is partial otherwise, such as a pull request adding a few strings. A full run assesses every entry. A partial run assesses only the entries the run wrote: those step 2 listed, and every older entry whose translation it changed, such as a `check.ts` fix or a new pin's. Either passes with no critical or major finding open.

1. **Assess.** Run `bun .claude/skills/translate/collect.ts --dump <tag> --out <scratchpad>/translate`, so the dump holds the catalogs as they now stand. For a partial run, also run `bun .claude/skills/translate/mqm.ts --dir <scratchpad>/translate --list --base <base> <tag>`, with step 2's `<base>`, which writes `<tag>.assess.txt`: the entries of `<tag>.txt` and every other entry whose translation differs from the catalog at the merge base. Spawn three `translation-mqm-reviewer`s per locale, every locale's in one message, so they run in parallel. Each is cold and blind to the other two: its prompt carries the locale tag, whether the run is full or partial, and only these paths, never a `*.review.json`, a `*.check.json`, another run's or an earlier round's MQM file, or anything an agent said:
   - the dump `<tag>.dump.txt`;
   - for a partial run, the list `<tag>.assess.txt`;
   - the style sheet `languages/<tag>.md` and its sidecar `languages/<tag>.json`;
   - the glossary slice `<tag>.glossary.md`, plus `glossary.md` when step 2 warned about skipped lines;
   - its own output path, `<scratchpad>/translate/<tag>.mqm.<run>.json`, with `<run>` 1, 2 or 3.
2. **Score.** Run `bun .claude/skills/translate/mqm.ts --dir <scratchpad>/translate <tag>…`, with `--partial` for a partial run, and keep its output: a table per locale, with each run's score beside the median, then every run's blocking finding with the reviewer's reason under it, the minor ones, the term-level ones, the applied ones and the dismissed ones, an entry's line saying how many runs reported it at that severity, which is not agreement on one error. It writes the findings still open to `<tag>.mqm.corrections.json`, one object per entry at its most severe finding, with every run's finding in `all`. It exits 1 when a locale is blocked, which is a result, not a failure. A finding is applied once the catalog no longer holds the translation `<tag>.dump.txt` showed the runs, so score against the dump the round's reviewers read. Exit 2 means a findings file it can't score, such as a finding that names no assessed entry, and each error names its run's file: continue that run's reviewer with `SendMessage` and the errors, to correct the names alone, and score again. After two such corrections, report the errors and the locale fails the run. A lone `<tag>.mqm.json`, without run files beside it, is scored as one run, as a test or a rerun of one reviewer writes it; a round always has three.
3. **Adjudicate.** Rule on every blocking finding, whichever number of runs reported it: it stands, and goes to the translator, or you dismiss it. Check a minor you doubt the same way; the rest go to the translator as they are. A finding you have shown false, such as a meaning the source line contradicts or a correction Chrome's count contradicts, gets a `dismissed` field with the reason, which you write and the reviewer never does, on the one finding it rules on, in that run's file, then score again. It removes that finding alone: another run's finding on the same entry can name a different error, so each critical or major gets a ruling of its own, and `mqm.ts` lists every run's blocking finding for you to rule on. Dismiss only with a reason checked against the code or a source, such as the line an entry's origin names or a Chrome count, never on your own reading of the language. `mqm.ts` leaves a dismissed finding out of its run's score and the gate, and lists each one with its run and reason. A dismissed finding still points at something to fix: a term-level one at the sidecar rule that should have settled the word, any other at the English or its translator comment that let the reviewer misread it. Fix that in the same run, and send nothing to the translator for the finding.
4. **Correct.** Continue each locale's translator with `SendMessage`, passing the path of `<tag>.mqm.corrections.json` and telling it to apply every correction in it. It says why for each it leaves, citing the style sheet, the sidecar or the glossary. A blocking finding it leaves still blocks: dismiss it, when its reason holds against the code or a source, or it stays open.
5. **Settle terms.** A finding that carries a `source` is term-level: a word the glossary or the source order should settle. In the same run, make it a rule, as [Changing a rule](#changing-a-rule) says: a pin with its `example` or a ban in `languages/<tag>.json`, the word in the style sheet or the glossary, and for a ban its allowed wording in `fixtures/<tag>-clean.po` and a planted fault in `fixtures/<tag>-faults.po`; then run `bun test --isolate scripts/translate-*.test.ts` and `check.ts --locale <tag>`, and send any finding to the translator. A term-level finding that contradicts a rule already in the sidecar goes to the report instead, since the rule came from the source order.
6. **Score again.** Run step 2's command again, without regenerating the dump: each correction the translator made now reads as applied. A locale still blocked has a critical or major finding open, which goes to the report with the reviewer's reason and the translator's answer, and the locale fails the run. A locale is never forced through by editing the catalog yourself.
7. **Score the corrections.** Once a locale passes, run `bun .claude/skills/translate/mqm.ts --dir <scratchpad>/translate --corrected <tag>…`, still before regenerating the dump, which writes `<tag>.assess.txt`: every entry whose translation differs from what the runs read, the translator's corrections and any `check.ts` fix step 5 asked for. When it lists none, the locale is done. Otherwise rename each of its `<tag>.mqm.<run>.json` to `<tag>.round<round>.mqm.<run>.json`, and `<tag>.mqm.corrections.json` to `<tag>.round<round>.mqm.corrections.json`, `<round>` starting at 1, and run steps 1 to 6 again for that locale as a partial run over that list, skipping step 1's `--list`, which would overwrite it, with three new `translation-mqm-reviewer`s, never continued ones, so they judge the corrections cold; a new critical or major blocks as before. Stop after two such passes; corrections the second one leads to are held by `check.ts` alone, and go to the report as unscored.

Then run the checks of [5. Check](#5-check) again, since the corrections changed the catalogs.

## 7. Report

Per locale, say:

- how many entries were translated, how many review rounds they took, and the `wrong` findings fixed and still open, each open one with its msgid, the problem, the suggested fix and the translator's answer;
- the count of `improve` findings, the path of `<tag>.review.json` that holds them, how many the translator applied and each one it left with its reason;
- the MQM table from `mqm.ts`, its median score and each run's, points per 1,000 words and critical, major and minor counts, for every round, with whether the run was full or partial, and how many entries each corrections pass scored; how many corrections the translator applied and each one it left with its reason; each critical or major finding still open; every dismissed finding with its reason and what was fixed so it does not recur; each term-level finding with the rule it became, or why it didn't; each critical or major finding only one run reported and what you made of it; and where the MQM reviewers said they were less sure;
- the translator's unsure choices, as its reply lists them, the reviewer's doubts it had no fix for, and the product questions from either agent;
- each `check.ts` finding the reviewer dismissed, with its reason;
- every term a translator chose that the glossary lacks, so it can be added to `glossary.md`.

Then show the output of the checks in step 5, as they ran last.

Leave the catalogs uncommitted: the translations land in the same commit as the strings they translate.

## Changing a rule

A decision recorded in a sidecar, `languages/<tag>.json`, carries its own test: a pin's `example` holds the wording it allows and a fault it catches, and for every other rule `fixtures/<tag>-clean.po` holds the wording it allows and `fixtures/<tag>-faults.po` a planted fault, which `scripts/translate-check.test.ts` holds the rules against. Keep a hand-written fixture entry only for what an example can't say, such as a ban's allowance or a fault that trips two rules at once, and add it with `bun .claude/skills/translate/fixture.ts <tag> clean|faults --msgid <English> --msgstr <translation> [--msgctxt <context>] [--origin <path>] [--fault <rule>:<id>]`, which keeps the blank line before it and the newline after it that `scripts/translate-fixtures.test.ts` checks every fixture for. Changing a decision means changing the style sheet, the glossary, the sidecar and, for a ban, the fixtures together, then running `bunx oxfmt .claude/skills/translate/languages/<tag>.json`, since a sidecar written by hand rarely matches the formatter and CI's `fmt:check` fails on it, and `bun test --isolate scripts/translate-*.test.ts`. A platform word changes in the sidecar alone, and `platform-table.ts` rewrites the style sheet's table from it.

## Splitting a message

When one msgid serves several labels that a language has to tell apart, such as an Auto whose adjective agrees with each setting's noun, the code gives each its own `context`, and extract would make each context a new, untranslated entry in every locale. Before extract, run `bun .claude/skills/translate/split-message.ts --msgid <English> --context <msgctxt>…`, with `--from <msgctxt>` when the shared entry has a context of its own. It copies the shared entry's translation into a fuzzy entry for each new context, in every locale's catalogs, so the next run's translators and reviewers only check that each still agrees with its context. Then run step 1's extract, which keeps those entries and drops the shared one once no code uses it.

## Beyond a run

These live in files of their own, each linked where a step needs it:

- [source-order.md](source-order.md): where every word comes from, and how a source is cited.
- [counting.md](counting.md): taking a Chrome count or a seven-app vote again, and when a cited one is ever recounted.
- [adding-a-language.md](adding-a-language.md): the seven places a language has to be in before it ships.
- [measuring.md](measuring.md): measuring the MQM reviewers and the pipeline reviewer on the regression sets, after any change to a reviewer's prompt, model or effort, or to step 4 or 6, with the recorded results to set a new measurement beside and the reviewers' known weaknesses, which a translator or the lead watches for since the gate can miss them.
