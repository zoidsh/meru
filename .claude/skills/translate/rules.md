# Rules, splits and new strings

## Changing a rule

A rule is a pin, ban or allowance in the sidecar `languages/<tag>.json`, with its word in the style sheet `languages/<tag>.md` or `glossary.md`. Change them together.

1. **Test it.** A pin's `example` holds the allowed wording and a fault it catches; once the catalog has the example's entry, the allowed wording is the catalog's translation (`scripts/translate-examples.test.ts`). Every other rule gets its allowed wording in `fixtures/<tag>-clean.po` and a planted fault in `fixtures/<tag>-faults.po` (`scripts/translate-check.test.ts`). Hand-write a fixture only for what an example can't say, such as a ban's allowance or a fault tripping two rules, with `bun .claude/skills/translate/fixture.ts <tag> clean|faults --msgid <English> --msgstr <translation> [--msgctxt <ctx>] [--origin <path>] [--fault <rule>:<id>]`.
2. **Cite it.** A reason citing a Chrome count cites the exact messages: `countEnglish` when the count isn't the pin's msgid as a whole word, `countExpect` when the word is built on Chrome's, `countKeepAccessKeys` for a menu item read by its access key ([counting.md](counting.md#a-chrome-count)), so `bun .claude/skills/translate/count.ts <tag> <id>` reproduces it. A rule resting on a recorded call (source order 4b) or an exception carries `"call": { "reason": "<one line>", "date": "YYYY-MM-DD" }`; `check.ts --calls [--locale <tag>]` lists them.
3. **Propagate it.** A pin changing an option's or label's word changes every sentence naming it: `bun .claude/skills/translate/check.ts --locale <tag> --mentions <pin id>` lists them as JSON; move each to the new word and pin the sentence form too.
4. **Platform words** change in the sidecar alone; `bun .claude/skills/translate/platform-table.ts <tag>` rewrites `languages/<tag>.platform.md`. Look a word up with `bun .claude/skills/translate/platform-word.ts <English> [--tag <tag>…]`; take its first candidate, citing the source id it prints. An inferred word cites what it is built from.
5. **Verify**, all passing before the rule is done:

   ```sh
   bunx oxfmt .claude/skills/translate/languages/<tag>.json
   bun .claude/skills/translate/count.ts <tag> --check   # fix citations or count fields, never the number alone
   bun test --isolate scripts/translate-*.test.ts
   bun .claude/skills/translate/check.ts --locale <tag>
   ```

   `count.ts` needs the Chrome corpus: `bun .claude/skills/translate/corpus.ts --source chrome <tag>` when `.cache/translate` lacks it. Send any new `check.ts` finding to the translator.

## Splitting a message

When one msgid serves labels a language must tell apart (an adjective agreeing with different nouns), the code gives each a `context`. Before extract:

1. `bun .claude/skills/translate/split-message.ts --msgid <English> --context <msgctxt>… [--from <msgctxt>]` copies the shared translation into a fuzzy entry per context in every locale.
2. Accept a fitting copy with `bun .claude/skills/translate/set-entry.ts --locale <tag> --msgid <English> --context <msgctxt>`; add `--msgstr <translation>` to replace it. `set-entry.ts` edits any single entry safely.
3. `bun run i18n:extract`.
4. A `macOS`/`Windows`/`Linux` split also needs a Platform words row in every sidecar: `bun .claude/skills/translate/platform-word.ts <English> --add-row <row>` ([adding-a-language.md](adding-a-language.md)).

## New strings

Before step 3, when step 2 found new msgids (`<tag>.txt`, or the added msgids in `git diff "$(git merge-base <base> HEAD)" -- packages/shared/i18n/locales/en.po packages/preload-gmail/locales/en.po`):

1. `bun .claude/skills/translate/shared-messages.ts` and `--menus`. Split any new msgid a language can't share (above), then rerun steps 1 and 2.
2. New buttons, menu items or other labels: check each label's kind against the `## Label forms` section of every style sheet (grep for the heading and read that section only); add a line where the kind is new.
3. A new `macOS`/`Windows`/`Linux` entry gets its Platform words row in every sidecar with `platform-word.ts --add-row`.
