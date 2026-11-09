---
name: translate
description: Translate Meru's interface strings into every shipped language, with a translator and a reviewer agent per locale, and an MQM gate when a language is first translated. Use after wrapping or changing a user-visible string, when CI's catalog checks report untranslated entries, or when asked to translate the catalogs.
---

# Translate

Fill every shipped locale's untranslated and fuzzy entries in `packages/shared/i18n/locales/<tag>.po` and `packages/preload-gmail/locales/<tag>.po`, then pass CI's checks. Agents are in `.claude/agents`: `translator`, `translation-reviewer`, `translation-mqm-reviewer`.

Run kinds, decided per locale in step 2:

- **Partial**: the entry file lists some entries, such as a pull request adding strings. The common case. Steps 1–5 and 7.
- **Full**: the entry file lists every entry (a language's first translation), or the user asks for the whole catalog or for MQM. Steps 1–7, with [mqm.md](mqm.md) as step 6.

**Scope.** A run changes only the entries its `<tag>.txt` lists. Never change an older translation to match a new rule, a review or a preference; put it in the report under Outside this run. `collect.ts --apply` refuses unlisted entries; pass `--outside` only when the user asked for that change.

Words come from the first source in [source-order.md](source-order.md). Cited counts are frozen; recount only per [counting.md](counting.md). Rule, split and new-string procedures are in [rules.md](rules.md); read it only when a step sends you there.

## 0. Preconditions

1. `printenv CLAUDE_CODE_EFFORT_LEVEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: if either prints, stop and tell the user to restart without it (`env -u CLAUDE_CODE_EFFORT_LEVEL claude`). Never pass `model` or `effort` when spawning.
2. Headless (`claude -p`) only: `printenv CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` must print `0`, else stop and give the user `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE claude -p "/translate" --permission-mode bypassPermissions`.
3. `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts` is `en` alone: say nothing to translate; stop.
4. Run `printenv TRANSLATE_SCRATCH`. When it prints a path, `<dir>` is that path plus `/translate` (`mkdir -p`), whatever scratchpad the session has. Otherwise `<dir>` is `<session scratchpad>/translate`, or, with no session scratchpad, `$(mktemp -d "$TMPDIR/translate.XXXXXX")/translate`. Never `/tmp`, never another session's folder. Print it in the report.

## 1. Extract

`bun run i18n:extract`

## 2. Collect

`bun .claude/skills/translate/collect.ts --base <base> --out <dir>`, `<base>` = `gh pr view --json baseRefName -q .baseRefName`; with no pull request, `beta` when `git merge-base --is-ancestor origin/beta HEAD` succeeds, else `main`. Pass a branch name. Never fetch or rebase during the run.

Per locale it writes `<tag>.txt` (entries with msgctxt, `#.` comments, origins, `prior art`) and `<tag>.glossary.md` (the glossary slice), and labels each locale `translate` or `review`.

- Grep the entry files for `prior art`; drop a pairing that isn't the same string reworded.
- Warning about skipped glossary lines: also pass `glossary.md` wherever a slice is passed, and report it.
- Exit 2 (`--base` unresolved): fetch the base or pass another branch and rerun. Never skip that locale.
- `review` locale (translations changed by hand, nothing untranslated): skip step 3; in step 4 a fix list goes to a new `translator`.
- Nothing to do in a locale: only step 5.
- New msgids exist and this isn't a language's first run: do [rules.md § New strings](rules.md#new-strings) before step 3.

## 3. Translate

Spawn one `translator` per `translate` locale, all in one message. Prompt: the locale tag; the paths of `languages/<tag>.md`, `languages/<tag>.platform.md`, `<dir>/<tag>.glossary.md`, both PO files and `<dir>/<tag>.txt` (paths, never contents); "Lingui syntax: read the docs page URL with `.md` appended, such as https://lingui.dev/ref/macro.md." Keep each agent ID.

## 4. Review, one fix round

As each translator returns:

1. `bun .claude/skills/translate/check.ts --locale <tag> > <dir>/<tag>.check.json` (exit 1 = findings; exit 2 = crash, report it).
2. `bun .claude/skills/translate/collect.ts --dump <tag> --out <dir>`: writes `<tag>.dump.txt` and `<tag>.context.txt`.
3. Spawn one `translation-reviewer`. Prompt: the locale tag, partial or full, the Lingui line, and the paths of `<tag>.txt`, `<tag>.context.txt`, `<tag>.dump.txt`, `<tag>.check.json`, `languages/<tag>.md`, `languages/<tag>.platform.md`, `languages/<tag>.json`, `<tag>.glossary.md`, and its output `<dir>/<tag>.review.json`. Keep its ID.

Then:

- Reply ends `PASS: <tag>`, no `improve` findings, and no `check.ts` finding left standing: locale closed.
- Otherwise build one fix list: every `check.ts` finding the reviewer didn't dismiss (CI fails on any severity), every `wrong` finding, and every `improve` finding, each with catalog (`app` or `preload-gmail`, not the PO path), msgctxt, msgid, msgstr, kind, reason, suggestion. `SendMessage` it to the translator. Rerun `check.ts` into the same file. If the list held any `wrong` or `check.ts` finding, `SendMessage` the reviewer to re-review those entries only, naming the new report.
- No second round. A finding still open goes to the report with the reviewer's text and the translator's answer. Never edit a catalog yourself to close one.
- A `check.ts` finding the reviewer dismissed: verify its reason against the sidecar and source. Holds: add the allowance per [rules.md § Changing a rule](rules.md#changing-a-rule). Doesn't: it goes on the fix list. Report either way.
- A reviewer `wrong` finding that names a glossary, platform or pinned word not in the rules: make it a rule per [rules.md § Changing a rule](rules.md#changing-a-rule) only when `check.ts --locale <tag>` then flags no older entry; otherwise leave the rules as they were and report it as a proposed rule.
- Only wording goes to the reviewer. Unsure choices, doubts without a fix and product questions go to the report.
- No `SendMessage`: spawn a new agent of the same type with the original prompt, the list and the previous reply.

## 5. Check

```sh
bun run i18n:extract
bunx lingui check sync --clean --workers 1
bunx lingui check missing --mode catalog --verbose --workers 1
bun run i18n:check
bunx lingui compile --strict
bun .claude/skills/translate/check.ts --shipped --strict
```

A failure names entry and locale: send it to that locale's translator as one finding and rerun once; still failing, report it. `check.ts` exit 2: report, don't retry. A reported finding the reviewer dismissed for a reason that held means its allowance is missing: add it, send nothing to the translator. A finding in a locale nobody worked on this run, or on an older entry: report it, never fix it; one caused by a rule change this run made means undoing that rule change.

## 6. MQM (full runs only)

Follow [mqm.md](mqm.md), then step 5 again.

## 7. Report

Per locale, only what needs the user:

- entries translated; `wrong` fixed / open (each open one: msgid, problem, suggestion, translator's answer); `improve` applied / left with reasons;
- full runs: the `mqm.ts` table, open critical or major findings, dismissed findings with reasons, term-level findings and the rule each became;
- translator's unsure choices, reviewer's unresolved doubts, product questions;
- dismissed `check.ts` findings with reasons;
- Outside this run: problems agents saw in older entries, and proposed rules that would change them, for the user to decide;
- terms chosen that the glossary lacks.

Then the last output of step 5.

Leave catalogs uncommitted and commit nothing. Rule changes for this run's strings, such as opener lines, glossary terms or label forms, land in the same branch as the strings, as their own commit. Stage each finished rule change alone (sidecar, style sheet, platform table, glossary, fixtures, scripts, tests) with `git add`, never a catalog, and never change a rule file and a catalog in one command. Source, English and comment edits stay unstaged with the catalogs. Finish with `git diff --cached > <dir>/rules.patch` and `git diff > <dir>/catalogs.patch` and name both. If anything was staged before the run, stage nothing and list the rule files instead.

## Elsewhere

- [mqm.md](mqm.md): step 6.
- [rules.md](rules.md): changing a rule, splitting a message, new strings.
- [source-order.md](source-order.md): where a word comes from.
- [counting.md](counting.md): Chrome counts and the seven-app vote.
- [adding-a-language.md](adding-a-language.md): shipping a new language.
- [measuring.md](measuring.md): measuring the reviewers after a change to a reviewer's prompt, model or effort, or to what a full run reads.
