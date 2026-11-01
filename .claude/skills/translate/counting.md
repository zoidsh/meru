# Counting

How a Chrome count, **(Chrome n/N)**, and a seven-app vote, **(agent-chosen: word: n of 7 (apps))**, are taken again, as [source-order.md](source-order.md) cites them. Three scripts do it, all beside this file:

```sh
bun .claude/skills/translate/corpus.ts fr                  # fetch and build every corpus for French
bun .claude/skills/translate/count.ts fr                   # every French pin and ban, beside the count its reason cites
bun .claude/skills/translate/count.ts fr launcher --show   # one pin, with the messages it matched
bun .claude/skills/translate/vote.ts fr -- notify          # one concept's vote
```

## A count is frozen once cited

A count or a vote, once a glossary entry or a sidecar reason cites it, is not taken again to refresh it. Recount only when a rule is disputed, or when an Electron upgrade changes Chromium's wording for the term; a recount that differs replaces the old number in the glossary and the sidecar together, and a vote whose winner changes goes back through the source order. A count from these scripts that differs from a cited one by a message or two, with the same word winning, is no dispute.

## The corpora

`corpus.ts <tag>…` writes `.cache/translate/corpus/<source>.<tag>.jsonl`, one `[english, translation]` pair per line, and keeps every download under `.cache/translate/raw`, which git ignores. Nothing of these texts is ever checked in; only the words and counts a rule cites enter Meru. `--source <name>` builds one source, and `--refresh` builds it again from the downloads already there. It needs `git`, `unzip` and network access, and Apple's corpus needs macOS.

- **chrome**: Chromium's `generated_resources`, `components_strings` and `ui_strings` translations, the `.xtb` files at the Chromium version of the Electron in `node_modules` (`process.versions.chrome`), from the chromium/chromium mirror on GitHub, so any OS can fetch them. The `.xtb` files hold no English, so the `en-GB` translation stands for it, by message id: a term British English spells its own way, such as _colour_ or _favourite_, is counted by its British spelling.
- **thunderbird** and **firefox**: Mozilla's l10n repositories, `thunderbird/thunderbird-l10n` and `mozilla-l10n/firefox-l10n`, each aligned by file and key with its `-l10n-source` English, Fluent, `.properties` and `.dtd` files alike. es-419 reads Firefox's es-MX and Thunderbird's es-AR.
- **vscode**: `microsoft/vscode-loc`'s language packs. It has no English pack, so its pseudo-locale, `qps-ploc`, read back letter by letter, stands for the English. It has no Dutch or Swedish, and es-419 reads its one Spanish.
- **android**: AOSP's `strings.xml` of Settings, SystemUI, the framework, Messaging and Email, on `main`, aligned by name; es-419 reads `values-es-rUS`.
- **libreoffice**: `LibreOffice/translations`, every PO file of the language; es-419 reads its one Spanish.
- **microsoft**: the Microsoft Terminology Collection, `MicrosoftTermCollection.zip`, each English term with each translation; its one Spanish stands for both of Meru's.
- **apple**: this Mac's own `.loctable` files under `/System/Applications` and `/System/Library/ExtensionKit/Extensions`, aligned by key with their English. Only macOS has them; elsewhere Apple has no vote.

### Chrome's own pack

Every count a rule cites now comes from the `.xtb` files, and says so. A pack is the other route, for a question the `.xtb` files can't answer, such as a string only one platform's build has: an installed Chrome ships it as `Google Chrome Framework.framework/Versions/<version>/Resources/<lang>.lproj/locale.pak`, paired by resource id with `en.lproj/locale.pak`. Its English is Chrome's own, and it holds every string of that platform's build, so its counts differ from the `.xtb` ones, by a few messages or, for an exact label such as Back, by many. To read a pack on any OS, take a Chrome for Testing build from `https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json`: the `mac-arm64` zip holds the macOS packs at that path inside `Google Chrome for Testing.app`, the `linux64` and `win64` zips hold `locales/<lang>.pak`. Chrome for Testing has no build of every version, the pinned Chromium included, so take the nearest on the same branch, the same first three numbers, and say which. A pack of format 5 is a 12-byte header, version, encoding, resource count and alias count, then a table of `uint16` resource id and `uint32` offset per resource, one more entry marking the end, then the aliases; each resource is its UTF-8 string. `count.ts` reads only the `.xtb` corpus.

## A Chrome count

`count.ts <tag> [<rule id>…]` counts each pin and ban of `languages/<tag>.json` and prints the count its reason cites beside it. For a pin, N is Chrome's messages whose English matches its `msgidPattern`, or its `msgid` as a whole word, ignoring case, and n those of them whose translation matches its `expect` without the anchors, ignoring case, Chrome's straight apostrophe read as the style sheet's ’. For a ban, it is the messages whose translation has the banned form. A term Meru alone has is counted by the Chrome term its word comes from, such as trusted for trusted hosts or device name for a device label: pass that term as `--english <regex>`. `--english` with `--expect` and no rule counts any term.

## A vote

`vote.ts <tag>… [-- <concept>…]` runs the vote of the source order's step 4c for each concept in `vote-concepts.json`, which names the concept in English, Meru's narrowest sense of it, with `englishNot` for English that has the word in another sense, each language's candidate words as patterns, and in `exclude` the words another of Meru's concepts already uses there. In each app, each distinct message whose English has the concept counts once, for the candidate it matches longest; the app votes for the candidate it uses most, and two candidates level are a tie that votes for neither; the word with most votes wins. It prints the status, the citation and every app's vote, and `--detail` each app's message counts. A status other than `ok`, fewer than 3 apps or a tie, or a winner with 2 votes or fewer, goes to the fallback the source order gives. A new concept goes into `vote-concepts.json` with the vote it was decided by, so the vote can be taken again.

## Where the apps' corpora differ from the earlier vote's

The votes the glossary cites were taken on corpora built before these scripts, and two differ from what `corpus.ts` builds; no winner changes, so the cited votes stand under the freeze rule:

- VS Code's pseudo-locale was read with þ as _th_ and § left as it was, so its English never held _badge_, _Settings_ or any other word with a b or a capital S. Read correctly, French badge is 5 of 7 rather than the cited 4, and the sidebar 4 of 7 rather than 3, both with VS Code added to the same winner.
- Apple's corpus reads every `.loctable` under ExtensionKit's extensions, not only those at `Contents/Resources`, so its French holds 120,602 pairs rather than 119,881.
