---
name: release-notes
description: Write release notes for Meru. Use when drafting or updating GitHub Release notes, changelogs, or "what changed" summaries for a release.
---

# Release Notes

## Gathering the changes

- The release being written is the one the version commit at `HEAD` bumps to — a commit whose subject is the bare version number, matching `version` in `package.json` (e.g. `3.58.0`, tagged `v3.58.0`). The range runs from the previous release's tag to that commit; `gh release list -L 2` gives both tags.
- Triage the log before opening a single diff. Drop on the commit subject alone: comment and docs edits, refactors and extractions, `TODO.md` notes, tests, CI, and dependency bumps other than Electron. A release of 40 commits usually has around 10 user-facing ones.
- For the commits that survive, `gh pr view <number>` is the fastest read — the PR body states what changed for the user, the commit subject often doesn't. Fall back to `git show` when there is no PR.
- Don't trust a commit message's scope — verify the actual fix from the diff. Messages often name a single platform or quote a GitHub issue title (e.g. "fix window position resetting after Windows reboot") when the underlying bug affects every platform. Only scope a note to a platform with `**macOS:**`/`**Windows:**` when the code confirms the fix is platform-specific.
- Describe the end state at the tag, not the journey. A feature that landed and was then renamed, redesigned, or extended over several commits in the same release gets one bullet describing how it works now.
- Drop fixes to code newly introduced in the same release — a bug that only existed between merge and tag is invisible to users upgrading from the previous public release.
- Skip changes that aren't user-observable given existing constraints (e.g. don't mention gating a feature behind Pro if free-tier limits already made it inaccessible).

## Structure

- Sections are `## Added`, `## Changed`, `## Fixed`, `## Internal Changes`, in that order, omitting unused ones. Lead with `## Changed` when a change is needed to understand `## Added` — v3.58.0 opened with the Google Apps → Workspace Apps rename because every new tab bullet below it says "Workspace Apps".
- Classify each change correctly:
  - `Added` — new feature or capability
  - `Changed` — intentional change to existing behavior, rename, or default
  - `Fixed` — resolves a bug or unintended behavior (e.g. windows stacking awkwardly)
- `## Internal Changes` is essentially only for Electron upgrades — bumping Electron pulls in a new Chromium, which carries performance and security improvements users benefit from. Other dependency, CI, or tooling upgrades (e.g. TypeScript, dnd-kit, electron-builder, build config, `CLAUDE.md`) are not user-observable, so omit them; if Electron wasn't upgraded, there's no `## Internal Changes` section at all.
- Group related bullets next to each other (e.g. all Workspace Apps changes together).
- Use sub-bullets for details: options list, defaults, keyboard shortcuts, behavior nuances. Always state the default for new options.

## Writing

- Write user-facing, not commit-facing. Describe what changed for the user, not the commit history or implementation. Merge multiple commits for one feature into a single bullet.
- Lead with outcome, not mechanism. "New windows no longer stack on top of each other" beats "Added cascading window positioning". Avoid internal jargon like "patch-burst" or "debounce".
- Never reference PR numbers, issue numbers, commit hashes, or contributor handles. Commit subjects carry a trailing `(#792)` — drop it.
- Say what carries over whenever a rename, move, or behavior change could read as lost settings or data: "Your existing settings carry over automatically", "Your existing Gmail zoom level is preserved".
- When reverting or removing a previously released feature, include the reason inline so users who relied on it understand the change.
- Prefix Pro-only features with `**Meru Pro:**`.
- Reference settings paths in backticks, with an ellipsis character rather than three dots: `` `Settings… → Section → Option` ``.
- Wrap keyboard shortcuts in `<kbd>` tags and write them per platform: `<kbd>Cmd</kbd>+<kbd>F</kbd> on macOS, <kbd>Ctrl</kbd>+<kbd>F</kbd> on Windows/Linux`.

## Output

- Release notes live only on GitHub Releases — do not commit a `RELEASE_NOTES.md` or `CHANGELOG.md` file, and do not write the notes anywhere inside the repo. Match the style of recent published releases at https://github.com/zoidsh/meru/releases.
- Write the finished notes onto the release for the version commit's tag: `gh release edit v<version> --notes-file <path>`, with the notes in a temporary file outside the repo. Pass a file rather than `--notes` so the markdown, backticks and `<kbd>` tags survive the shell.
- Read the current body first with `gh release view v<version> --json body -q .body`. When the release already has notes, fold the changes into them and overwrite without asking — editing replaces the body wholesale, so always pass the complete set of notes, never just the new bullets.
- If no release exists for the tag yet, stop and ask — creating one triggers the build-and-publish workflow, which is not this skill's job.
- Share the release URL after writing, and print the notes in chat as well.
