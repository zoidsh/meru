# Step 6: MQM

Full runs only: a locale whose entry file listed every entry, or one the user asks to have assessed. Three cold `translation-mqm-reviewer`s list every error with category, severity and correction; `mqm.ts` scores them. Points: minor 1, major 5, critical 25; score = 100 × (1 − points / English source words). The score is the median of the three runs, reported, never gated on. The gate: no critical or major open.

When the user asks for MQM on a partial run, also run `bun .claude/skills/translate/mqm.ts --dir <dir> --list --base <base> <tag>` before spawning, which writes `<tag>.assess.txt`; say "partial run" and pass that path in each prompt, and score with `--partial`.

Every run's findings count; never vote between runs. Findings match by entry (catalog, msgctxt, msgid); an entry takes its most severe finding, with every run's kept in `all`.

## 1. Assess

1. `bun .claude/skills/translate/collect.ts --dump <tag> --out <dir>`.
2. Spawn three `translation-mqm-reviewer`s per locale, every locale's in one message. Prompt: the locale tag, "full run", and only these paths: `<dir>/<tag>.dump.txt`, `languages/<tag>.md`, `languages/<tag>.json`, `<dir>/<tag>.glossary.md` (plus `glossary.md` if step 2 warned), output `<dir>/<tag>.mqm.<run>.json` with `<run>` 1, 2, 3. Never a `*.review.json`, `*.check.json`, another MQM file, or anything an agent said.

## 2. Score

`bun .claude/skills/translate/mqm.ts --dir <dir> <tag>…`. Keep the output. It writes open findings to `<tag>.mqm.corrections.json`. Exit 1 = a locale is blocked (a result). Exit 2 = an unscorable file; `SendMessage` that run's reviewer the errors to fix the names only, rescore; after two tries, report and fail the locale. A finding counts as applied once the catalog no longer holds the translation the dump showed, so never regenerate the dump before rescoring.

## 3. Adjudicate

Rule on every critical and major finding, each on its own (runs can name different errors on one entry); check doubtful minors the same way; other minors go to the translator.

- Dismiss only with a reason checked against code or a source (the origin's source line, a Chrome count), never your own reading of the language. Write `"dismissed": "<reason>"` on that one finding in that run's file, then rescore.
- Term-level finding (category `terminology`, or a `source` naming a word): dismiss when its word has no source that holds it; check with `count.ts`, `platform-word.ts` or `vote.ts --show` per [source-order.md](source-order.md). Also dismiss a correction replacing Chrome's exact form with a word built on it, unless it is a recorded exception (source order 4a).
- Never dismiss an accuracy, grammar or style finding for lacking a source.
- A dismissed finding still points at a fix: a term-level one at the sidecar rule that should have settled it, any other at the English or its translator comment. Fix that now; send nothing to the translator.

## 4. Correct

`SendMessage` each translator the path of `<tag>.mqm.corrections.json`: apply every correction, or say why, citing the style sheet, sidecar or glossary. A blocking finding it leaves still blocks unless dismissed per step 3.

## 5. Settle terms

Each standing term-level finding becomes a rule per [rules.md § Changing a rule](rules.md#changing-a-rule). One that contradicts an existing sidecar rule goes to the report instead.

## 6. Score again

Rerun step 2's command without regenerating the dump. A critical or major still open goes to the report with the reviewer's reason and the translator's answer, and the locale fails. Never edit the catalog yourself to pass. Corrections are not reassessed by new MQM runs; `check.ts` and step 5 of the skill hold them.
