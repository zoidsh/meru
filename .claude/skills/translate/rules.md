# Rules, splits and new strings

## Changing a rule

A rule is a pin, ban or allowance in the sidecar `languages/<tag>.json`, with its word in the style sheet `languages/<tag>.md` or `glossary.md`. Change them together.

1. **Test it.** A pin's `example` holds the allowed wording and a fault it catches; once the catalog has the example's entry, the allowed wording is the catalog's translation (`scripts/translate-examples.test.ts`). Every other rule gets its allowed wording in `fixtures/<tag>-clean.po` and a planted fault in `fixtures/<tag>-faults.po` (`scripts/translate-check.test.ts`). Hand-write a fixture only for what an example can't say, such as a ban's allowance or a fault tripping two rules, with `bun .claude/skills/translate/fixture.ts <tag> clean|faults --msgid <English> --msgstr <translation> [--msgctxt <ctx>] [--origin <path>] [--fault <rule>:<id>]`.
2. **Cite it.** A reason citing a Chrome count cites the exact messages: `countEnglish` when the count isn't the pin's msgid as a whole word, `countExpect` when the word is built on Chrome's, `countKeepAccessKeys` for a menu item read by its access key ([counting.md](counting.md#a-chrome-count)), so `bun .claude/skills/translate/count.ts <tag> <id>` reproduces it. A rule resting on a recorded call (source order 4b) or an exception carries `"call": { "reason": "<one line>", "date": "YYYY-MM-DD" }`; `check.ts --calls [--locale <tag>]` lists them.
3. **Propagate it.** A pin changing an option's or label's word changes every sentence naming it: `bun .claude/skills/translate/check.ts --locale <tag> --mentions <pin id>` lists them as JSON; move each to the new word and pin the sentence form too. Those are older entries, so do this only when the user asked for the change (then `collect.ts --apply --outside`); otherwise report the proposed rule and change nothing.
4. **Platform words** change in the sidecar alone; `bun .claude/skills/translate/platform-table.ts <tag>` rewrites `languages/<tag>.platform.md`. Look a word up with `bun .claude/skills/translate/platform-word.ts <English> [--tag <tag>…]`; take its first candidate, citing the source id it prints. An inferred word cites what it is built from.
5. **Verify**, all passing before the rule is done:

   ```sh
   bunx oxfmt .claude/skills/translate/languages/<tag>.json
   bun .claude/skills/translate/count.ts <tag> --check   # fix citations or count fields, never the number alone
   bun test --isolate scripts/translate-*.test.ts
   bun .claude/skills/translate/check.ts --locale <tag>
   ```

   `count.ts` needs the Chrome corpus: run `bun .claude/skills/translate/corpus.ts --source chrome <tag>` first; it keeps a corpus already built for this Chromium. Send any new `check.ts` finding to the translator.

## Splitting a message

When one msgid serves labels a language must tell apart (an adjective agreeing with different nouns), the code gives each a `context`. Before extract:

1. `bun .claude/skills/translate/split-message.ts --msgid <English> --context <msgctxt>… [--from <msgctxt>]` copies the shared translation into a fuzzy entry per context in every locale.
2. Accept a fitting copy with `bun .claude/skills/translate/set-entry.ts --locale <tag> --msgid <English> --context <msgctxt>`; add `--msgstr <translation>` to replace it. `set-entry.ts` edits any single entry safely.
3. `bun run i18n:extract`.
4. A `macOS`/`Windows`/`Linux` split also needs a Platform words row in every sidecar: `bun .claude/skills/translate/platform-word.ts <English> --add-row <row>` ([adding-a-language.md](adding-a-language.md)).

## New strings

Before step 3, when step 2 found new msgids (`<tag>.txt`, or the added msgids in `git diff "$(git merge-base <base> HEAD)" -- packages/shared/i18n/locales/en.po packages/preload-gmail/locales/en.po`):

1. `bun test --isolate scripts/translate-*.test.ts`, before any translator runs, so a rule the new English breaks shows now rather than in a translator's reply. A new setting description opening with a verb no style sheet names fails it: add the verb with its imperatives to the `Setting description never opens with:` line of each sheet named, or, when the first word isn't a verb (Some, This), to `NON_VERB_OPENERS` in `scripts/translate-rules.test.ts`. A reworded msgid that a rule, fixture or regression entry names fails it too: also run `grep -rnF '"<old English>"' .claude/skills/translate/languages .claude/skills/translate/fixtures .claude/skills/translate/regression .claude/skills/translate/glossary.md` for each pairing step 2 printed as prior art, and move each pin, ban, exception, fixture, regression entry and style sheet line that names the old English onto the new one, keeping its words and sources.
2. `bun .claude/skills/translate/corpus.ts --source chrome <tag>…` for the locales with work, then give each new term the glossary lacks its Chrome word: `bun .claude/skills/translate/count.ts <tag> --english '<regex>' --expect . --show` lists Chrome's translations of the English. Add the term to `glossary.md` with each locale's word and its count, per [source-order.md](source-order.md); a term Chrome lacks goes to the translators as agent-chosen.
3. `bun .claude/skills/translate/shared-messages.ts` and `--menus`. Split any new msgid a language can't share, as [Splitting a message](#splitting-a-message) says, then rerun the skill's steps 1 and 2.
4. New buttons, menu items or other labels: check each label's kind against the `## Label forms` section of every style sheet (grep for the heading and read that section only); add a line where the kind is new.
5. A new `macOS`/`Windows`/`Linux` entry gets its Platform words row in every sidecar with `platform-word.ts --add-row`. A reworded one whose row exists keeps that row: rename its labels to the new English in every sidecar, keeping each word and source, then run `platform-table.ts <tag>` for each. When the English gains or loses an ellipsis, each platform's word follows it.
