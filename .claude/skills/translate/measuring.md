# Measuring the reviewers

German, Japanese and French each have a regression set, and Polish gets one when it ships: `regression/<tag>.po`, outside the real catalogs, holding about 35 entries whose shipped translation was accepted, some of them correct translations that look wrong, such as Gmail's own words or a pinned term, and about 30 known-bad ones, each marked `# expect: <category>[|<category>] <minimum severity>`. The known-bad ones are real errors earlier runs made, such as 未読アカウント, Webサイト, Schaltfläche and „sobald du sie schließt“, and planted ones covering wrong meaning, omission, addition, terminology, locale conventions, style and a broken placeholder or tag. At least 8 per language, marked `# hard`, are errors no `check.ts` rule catches, a floor that grows as runs make real errors worth keeping, which the reviewer has to read for: a near-miss meaning, such as a pronoun pointing at the wrong noun, a scope narrowed or widened, current for default or delete for remove; a calque; a wrong register; a dropped negation; swapped plural or select branches; a typo; a sentence where the style sheet wants a label. `# few-shot` marks the ones the reviewer's prompt shows as examples. `# check: <rule>:<id>` marks each `check.ts` finding a known-bad entry's planted error gives, and `scripts/translate-regression.test.ts` fails on any other, so an accepted entry passes every rule and a known-bad one holds no error but its planted one: build an entry from the catalog's exact bytes, no-break spaces included, and change only what it plants. `regression.ts` measures [`SKILL.md`](SKILL.md)'s step 6 on them twice, as two independent measurements of three runs each, since one measurement of the same prompt has moved French recall by three entries: it writes a dump of the set, without its marks, for each measurement, runs all six `translation-mqm-reviewer`s on it at once, headless, as a full run, and reports for each measurement recall per severity, how many known-bad entries any run reports at their severity or above, as the gate counts them, with and without the few-shot ones and for the hard ones alone, the false positives any run files on the accepted entries, and each run's own numbers. It also shows how much the gate leans on single runs: how many known-bad entries zero, one, two or three runs caught, and how many accepted entries zero, one, two or three runs flagged, each of which you would have to dismiss.

```sh
bun .claude/skills/translate/regression.ts run --dir <scratchpad>/regression de ja fr
```

Each measurement lives in its own directory, `<dir>/1` and `<dir>/2`. `prepare` writes the inputs and prints the six reviewer commands per locale instead, to run all at once, and `score` scores the findings files already there, then prints the range across the two measurements. A run that fails leaves the others to be scored: the measurement short of a run is labelled with how many it has, `score` lists each missing file under INCOMPLETE and exits 1, and such a result is never recorded until the missing runs are rerun. It needs the agents, so it never runs in CI. Run it, both measurements, after any change to a reviewer's prompt, its model or effort, or step 6, and record its range table in the pull request, set beside the last recorded result. A change whose recall moves within the range of the recorded measurements is noise, not a gain or a loss. Known reviewer weaknesses the set shows, which a translator or the lead watches for, since the gate can miss them:

- A pronoun or demonstrative that points at the wrong noun inside a long `select` message, such as German _sie_ or Japanese それらのアプリ for the tabs, read as the apps, or French _à sa place_, read as the new window or tab rather than the one named: no run catches it in German or Japanese, and in French one run of three caught it once, but none in either recorded measurement.
- A translation that swaps the object for a wider one, such as the user's Google account where the English means the account in Meru, is graded a minor addition by every run, not the major change of object it is.
- A loss of nuance inside a sentence with a tag, such as Japanese 1行として for "on its own line", is missed by every run.
- A style or idiom minor inside a long sentence: French _à vos risques_ cut short of _à vos risques et périls_ is caught by one run of three, and the calque _Les sites s’appliquent_ and the touch verb _Appuyez_ with an unquoted button label, where a desktop click is _Cliquez sur son bouton « Copier »_, by none.
- A tight label far longer than it needs to be, such as the French trial badge _L’essai Pro se termine dans # jours_ for _Fin de l’essai Pro dans # jours_: one run of three.

The recorded result for the reviewer prompt as it stands, two measurements of three runs each under the current rule, as the range across them:

| Range | Critical | Major |    Minor |   Recall |    Hard | False positives |
| ----- | -------: | ----: | -------: | -------: | ------: | --------------: |
| de    |      3/3 |   8/8 |    17/18 |    28/29 |    9/10 |            0/36 |
| ja    |      2/2 |   8/9 | 16–17/18 | 26–27/29 |     6/8 |          0–1/36 |
| fr    |      3/3 |   5/5 | 15–17/21 | 23–25/29 | 8–10/12 |            0/37 |

## The pipeline reviewer

`--agent reviewer` measures [`SKILL.md`](SKILL.md)'s step 4 `translation-reviewer` on the same sets, so a change to its prompt or model is measured rather than guessed at. Each measurement runs one reviewer, as step 4 does, both at once, on the set's dump, an entry file listing every entry, as in a first translation, and `check.ts`'s report on the set. Any of its findings on a known-bad entry catches it, whichever kind, since it grades none; any on an accepted entry is a false positive. `score` reports the reviewer alone, the reviewer with every `check.ts` finding, which is what step 4 sends the translator, and `check.ts` alone, then the range of the first two across the measurements, and how many known-bad critical and major entries the reviewer caught as `wrong`, so re-reviewed after the fix. Give it a directory of its own, apart from the MQM measurements:

```sh
bun .claude/skills/translate/regression.ts run --agent reviewer --dir <scratchpad>/regression-reviewer de ja fr
```

Run it, both measurements, after any change to the reviewer's prompt, its model or effort, or step 4, and record its range tables in the pull request beside the last recorded result. The recorded result for the reviewer prompt as it stands, two measurements of one reviewer each, as the range across them, alone and with `check.ts`'s findings:

| Range             | Critical | Major |    Minor |   Recall |   Hard | False positives |
| ----------------- | -------: | ----: | -------: | -------: | -----: | --------------: |
| de, reviewer      |      1/3 | 7–8/8 |     6/18 | 14–15/29 |   9/10 |            1/36 |
| de, with check.ts |      3/3 | 7–8/8 |    17/18 | 27–28/29 |   9/10 |            1/36 |
| ja, reviewer      |      1/2 |   7/9 |     4/18 |    12/29 |    8/8 |          1–2/36 |
| ja, with check.ts |      2/2 |   8/9 |    17/18 |    27/29 |    8/8 |          1–2/36 |
| fr, reviewer      |      1/3 |   5/5 |   7–8/21 | 13–14/29 | 7–8/12 |            1/37 |
| fr, with check.ts |      3/3 |   5/5 | 14–15/21 | 22–23/29 | 7–8/12 |            1/37 |

`check.ts` alone catches no hard entry, by their definition. Of the critical and major entries the reviewer caught, it filed all as `wrong` but one each in German and Japanese, in one measurement each.

The reviewer and the MQM reviewers catch different hard entries, so neither replaces the other. In Japanese the reviewer catches all 8 and MQM 6, the 2 more being the reviewer's alone; in French, MQM caught 3 the reviewer missed in one measurement, and each caught one the other missed in the other; in German both catch the same 9. None of them catches the German `{workspaceAppsInUse, select, …}` entry, and neither catches the French `{target, select, …}` entry, the wrong-noun pronoun the weaknesses above name.

Those four have sets because their plurals and cases differ most, while the reviewers' prompts are shared across languages, and each set is some 65 entries to write and keep. Polish's set is written when Polish ships, from its shipped catalog and its own real errors. Any other language gets a set only once a run has made a real error in it worth keeping, which becomes the set's first known-bad entry. `scripts/translate-regression.test.ts` holds the sets' shape and the scoring.
