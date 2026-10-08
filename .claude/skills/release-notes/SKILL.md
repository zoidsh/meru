---
name: release-notes
description: Write release notes for Meru. Use when drafting or updating GitHub Release notes, changelogs, or "what changed" summaries for a release.
---

# Release notes

## Gather the changes

- The release being written is the one the version commit at `HEAD` bumps to — a commit whose subject is the bare version number, matching `version` in `package.json`, such as `3.58.0` or `3.60.0-beta.1`, tagged `v3.58.0` or `v3.60.0-beta.1`.
- The draft is the `[Unreleased]` section of `CHANGELOG.md`. Every change adds its line there in the same commit, so read it in full before anything else. Stable releases are cut on `main` and Beta releases on `beta`, which is `main` plus unpromoted features, and the two read the section differently.
- **Stable.** The version commit emptied the section, so the draft is `git show HEAD~1:CHANGELOG.md`. It holds every fix that landed on `main` and every feature promoted from `beta` since the last stable, because a promoted feature's line travels inside its own commit.
  - The notes cover the whole cycle since the last stable, for the users who never saw a prerelease. The range runs from the last stable tag, from `gh release list --exclude-pre-releases -L 1`, to the version commit. Never `gh release list -L 2`, which picks up an interleaved `-beta.N` tag.
  - Don't fold in the notes of the betas published meanwhile. They were cut on `beta` and describe features that may not have been promoted; the ones that were are already in the draft.
- **Beta.** A beta's version commit leaves `[Unreleased]` alone, so on `beta` the section keeps every unpromoted feature's line, and the draft is what it gained since the build Beta users are on now.
  - That build, the previous one, is the higher version of the last prerelease, from `gh release list --json tagName,isPrerelease -q '[.[] | select(.isPrerelease)][0].tagName'`, and the last stable, from `gh release list --exclude-pre-releases -L 1`. Beta users are on whichever is higher, because the updater moves them onto a stable above their beta and never onto one below it.
  - The draft is the lines `git diff <previous> HEAD -- CHANGELOG.md` adds. A line it removes matters only when the feature left `beta` unreleased; a line a stable released and emptied is not a change for Beta users.
  - When the previous build is a beta and a stable was published after it, read that stable's notes (`gh release view v<version> --json body -q .body`) and fold its bullets in. Its fixes reached `beta` through a rebase, but the stable's version commit emptied their lines first, so the diff never shows them.
- Cross-check the draft against the commit log, because a line can be missed.
  - For a stable, read `git log --oneline <lastStableTag>..HEAD`.
  - For a beta, read `git log --oneline --cherry-pick --right-only --no-merges <previous>...HEAD`, never `<previous>..HEAD`. A rebase of `beta` rewrites every commit on it, so the previous beta's tag points at commits no longer on the branch, and a plain range lists every feature again. `--cherry-pick` drops the commits whose patch the previous build already had. It matches by patch, so a commit whose patch changed in a rebase, or in a promotion adjusted to fit `main`, survives it and sits on both sides of the range under different SHAs. A subject that also appears in `git log --format=%s HEAD..<previous>` is the same change the previous build already had, not a new one. Ignore beta version commits in it too.
  - Triage the log on subjects alone and drop comment and docs edits, refactors, tests, CI, and dependency bumps other than Electron. For a surviving commit with no changelog line, `gh pr view <number>` says what changed for the user; fall back to `git show`. Add the missing bullet to the notes and mention it in the review, since the commit that should have carried it didn't.
- Don't trust a commit message's scope — verify the actual fix from the diff. Messages often name a single platform or quote a GitHub issue title, such as "fix window position resetting after Windows reboot", when the underlying bug affects every platform. Only scope a note to a platform with `**macOS:**` or `**Windows:**` when the code confirms the fix is platform-specific.
- Describe the end state at the tag, not the journey. A feature that landed and was then renamed, redesigned, or extended over several commits in the same release gets one bullet describing how it works now, however many changelog lines it accumulated.
- Drop fixes to code newly introduced in the same release — a bug that only existed between merge and tag is invisible to users upgrading from the previous release on their channel. So a fix to a feature Beta users had and stable users never did stays out of the stable notes.
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

- Release notes live only on GitHub Releases. `CHANGELOG.md` holds nothing but the `[Unreleased]` draft — it never gets a versioned section, and the finished notes aren't written anywhere inside the repo. Match the style of recent published releases at https://github.com/zoidsh/meru/releases.
- Write the finished notes onto the release for the version commit's tag: `gh release edit v<version> --notes-file <path>`, with the notes in a temporary file outside the repo. Pass a file rather than `--notes` so the markdown, backticks, and `<kbd>` tags survive the shell.
- Read the current body first with `gh release view v<version> --json body -q .body`. When the release already has notes, fold the changes into them — editing replaces the body wholesale, so always pass the complete set of notes, never just the new bullets.
- If no release exists for the tag yet, stop and ask — creating one triggers the build-and-publish workflow, which isn't this skill's job.
- Share the release URL after writing.
