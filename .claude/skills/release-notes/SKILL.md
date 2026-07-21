---
name: release-notes
description: Write release notes for Meru. Use when drafting or updating GitHub Release notes, changelogs, or "what changed" summaries for a release.
---

# Release Notes

- Release notes live only on GitHub Releases — do not commit a `RELEASE_NOTES.md` or `CHANGELOG.md` file. Match the style of recent published releases at https://github.com/zoidsh/meru/releases.
- Output the release notes in chat for pasting into the GitHub release — do not write them to a file in the repo. Wrap the notes in a fenced markdown code block so the raw markdown can be copied directly into the GitHub release.
- Structure: use `## Added`, `## Changed`, `## Fixed`, `## Internal Changes` sections (in that order, omit unused ones). Skip `## Internal Changes` entirely when nothing affects end users (e.g. CI, CLAUDE.md, repo tooling).
- `## Internal Changes` is essentially only for Electron upgrades — bumping Electron pulls in a new Chromium, which carries performance and security improvements users benefit from. Other dependency or tooling upgrades (e.g. TypeScript, dnd-kit, electron-builder, build config) are not user-observable, so omit them; if Electron wasn't upgraded, there's usually no `## Internal Changes` section at all.
- Classify each change correctly:
  - `Added` — new feature or capability
  - `Changed` — intentional change to existing behavior, rename, or default
  - `Fixed` — resolves a bug or unintended behavior (e.g. windows stacking awkwardly)
- Write user-facing, not commit-facing. Describe what changed for the user, not the commit history or implementation. Merge multiple commits for one feature into a single bullet.
- Don't trust a commit message's scope — verify the actual fix from the diff. Messages often name a single platform or quote a GitHub issue title (e.g. "fix window position resetting after Windows reboot") when the underlying bug affects every platform. Only scope a note to a platform with `**macOS:**`/`**Windows:**` when the code confirms the fix is platform-specific.
- Lead with outcome, not mechanism. "New windows no longer stack on top of each other" beats "Added cascading window positioning". Avoid internal jargon like "patch-burst" or "debounce".
- Prefix Pro-only features with `**Meru Pro:**`.
- Skip changes that aren't user-observable given existing constraints (e.g. don't mention gating a feature behind Pro if free-tier limits already made it inaccessible).
- Reference settings paths as `Settings... → Section → Option`.
- Group related bullets next to each other (e.g. all Google Apps changes together).
- Use sub-bullets for details: options list, defaults, keyboard shortcuts, behavior nuances. Always state the default for new options.
- Drop fixes to code newly introduced in the same release — a bug that only existed between merge and tag is invisible to users upgrading from the previous public release.
- Wrap keyboard shortcuts in `<kbd>` tags and write them per platform: `<kbd>Cmd</kbd>+<kbd>F</kbd> on macOS, <kbd>Ctrl</kbd>+<kbd>F</kbd> on Windows/Linux`.
- When reverting or removing a previously released feature, include the reason inline so users who relied on it understand the change.
