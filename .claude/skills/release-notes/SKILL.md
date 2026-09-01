---
name: release-notes
description: Write release notes for Meru. Use when drafting or updating GitHub Release notes, changelogs, or "what changed" summaries for a release.
---

# Release notes

## Gather the changes

- The release being written is the one the version commit at `HEAD` bumps to — a commit whose subject is the bare version number, matching `version` in `package.json`, such as `3.58.0` or `3.60.0-beta.1`, tagged `v3.58.0` or `v3.60.0-beta.1`.
- The range runs from the previous release's tag to that commit, and which tag counts as previous depends on the channel:
  - **Stable** — the last stable tag, from `gh release list --exclude-pre-releases -L 1`. Never `gh release list -L 2`, which picks up an interleaved `-beta.N` tag and truncates the notes to the tail of the cycle.
  - **Beta** — the last release of any kind, from `gh release list -L 1`, so each prerelease covers only what's new since the previous one.
- Every release gets its own notes, prereleases included, written exactly the same way. A stable that promotes a cycle of beta releases therefore restates the changes those already carried, because its range runs back to the last stable. That repetition is intended: the stable notes have to be complete for the users who never saw a prerelease.
- Triage the log before opening a single diff. Drop on the commit subject alone: comment and docs edits, refactors and extractions, `TODO.md` notes, tests, CI, and dependency bumps other than Electron. A release of 40 commits usually has around 10 user-facing ones.
- For the commits that survive, `gh pr view <number>` is the fastest read — the PR body states what changed for the user, and the commit subject often doesn't. Fall back to `git show` when there's no PR.
- Don't trust a commit message's scope — verify the actual fix from the diff. Messages often name a single platform or quote a GitHub issue title, such as "fix window position resetting after Windows reboot", when the underlying bug affects every platform. Only scope a note to a platform with `**macOS:**` or `**Windows:**` when the code confirms the fix is platform-specific.
- Describe the end state at the tag, not the journey. A feature that landed and was then renamed, redesigned, or extended over several commits in the same release gets one bullet describing how it works now.
- Drop fixes to code newly introduced in the same release — a bug that only existed between merge and tag is invisible to users upgrading from the previous public release.
- Skip changes that aren't user-observable given the constraints already in place. Don't mention gating a feature behind Pro, for example, if free-tier limits already put it out of reach.

## Structure

- Sections are `## Added`, `## Changed`, `## Fixed`, `## Internal Changes`, in that order, omitting unused ones. Lead with `## Changed` when a change is needed to understand `## Added` — v3.58.0 opened with the Google Apps → Workspace Apps rename because every new tab bullet below it says "Workspace Apps".
- Classify each change correctly:
  - `Added` — new feature or capability
  - `Changed` — intentional change to existing behavior, rename, or default
  - `Fixed` — resolves a bug or unintended behavior, such as windows stacking awkwardly
- `## Internal Changes` is for Electron upgrades and little else — bumping Electron pulls in a new Chromium, which carries performance and security improvements users benefit from. Other dependency, CI, or tooling upgrades aren't user-observable, so omit them: TypeScript, dnd-kit, electron-builder, build config, and `CLAUDE.md` all fall here. If Electron wasn't upgraded, there's no `## Internal Changes` section at all.
- Group related bullets next to each other, keeping all the Workspace Apps changes together, for example.
- Use sub-bullets for details: options list, defaults, keyboard shortcuts, and behavior nuances. Always state the default for new options.

## Write the notes

- Write user-facing, not commit-facing. Describe what changed for the user, not the commit history or implementation. Merge multiple commits for one feature into a single bullet.
- Lead with outcome, not mechanism. "New windows no longer stack on top of each other" beats "Added cascading window positioning". Avoid internal jargon like "patch-burst" or "debounce".
- Never reference PR numbers, issue numbers, commit hashes, or contributor handles. Commit subjects carry a trailing `(#792)` — drop it.
- Say what carries over whenever a rename, move, or behavior change could read as lost settings or data: "Your existing settings carry over automatically", "Your existing Gmail zoom level is preserved".
- When reverting or removing a previously released feature, include the reason inline so users who relied on it understand the change.
- Prefix Pro-only features with `**Meru Pro:**`.
- Reference settings paths in backticks, with an ellipsis character rather than three dots: `` `Settings… → Section → Option` ``.
- Wrap keyboard shortcuts in `<kbd>` tags and write them per platform: `<kbd>Cmd</kbd>+<kbd>F</kbd> on macOS, <kbd>Ctrl</kbd>+<kbd>F</kbd> on Windows and Linux`.

## Review

- Print the drafted notes in chat and ask the user whether anything should be added, removed, or reworded before they go onto the release. Ask every time, including when folding changes into notes that already exist.
- Apply the feedback, print the revised notes, and ask again. Only write once the user is happy with them.

## Output

- Release notes live only on GitHub Releases — don't commit a `RELEASE_NOTES.md` or `CHANGELOG.md` file, and don't write the notes anywhere inside the repo. Match the style of recent published releases at https://github.com/zoidsh/meru/releases.
- Write the finished notes onto the release for the version commit's tag: `gh release edit v<version> --notes-file <path>`, with the notes in a temporary file outside the repo. Pass a file rather than `--notes` so the markdown, backticks, and `<kbd>` tags survive the shell.
- Read the current body first with `gh release view v<version> --json body -q .body`. When the release already has notes, fold the changes into them — editing replaces the body wholesale, so always pass the complete set of notes, never just the new bullets.
- If no release exists for the tag yet, stop and ask — creating one triggers the build-and-publish workflow, which isn't this skill's job.
- Share the release URL after writing.
