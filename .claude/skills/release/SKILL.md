---
name: release
description: Cut a Meru release. Use when asked to release, cut a release, ship a version, or bump the version.
argument-hint: [major|minor|patch|beta]
---

# Release

Stable releases are cut on `main` and Beta releases on `beta`, the long-lived branch that is `main` plus the features not yet promoted; `CLAUDE.md` describes the two. The version commit goes straight onto its branch, with no PR. Publishing the release fires `.github/workflows/release.yml`, whose `channel` job refuses a tag that doesn't match its channel and branch, then reruns CI and builds and uploads the macOS, Windows, and Linux artifacts. So a release is only cut off a branch that already passes CI.

## Pick the channel

A `beta` argument, or an explicit `-beta.N` version, cuts a Beta release. Anything else cuts a stable one. The channel fixes the branch, and it never crosses:

- A stable release is cut on `main`, never on `beta`. A stable cut on `beta` would ship every unpromoted feature to every user. A feature reaches stable by being promoted to `main` first.
- A Beta release is cut on `beta`, never on `main`. A beta version commit on `main` would leave `main`'s `[Unreleased]` and version out of step with `beta`, and a beta cut from `main` would ship without the features Beta users already have, which they'd lose on update.

Refuse a request that ties a channel to the other branch, such as "cut a stable off beta" or "a quick beta from main", say why, and stop. `release.yml` refuses the same releases, but only after the tag exists.

The channel is named Beta in the app and versioned `beta` on the wire, so the interface and the version string agree. The reasoning is in the project docs, in `decisions.md` under "The prerelease channel is named Beta" and "Beta releases are cut from a `beta` branch".

## Preconditions

Check all of these first. If one fails, report it and stop. Never work around it.

- The workflow names below are real: `.github/workflows/` holds `ci.yml` and `release.yml`. Check that before running any `gh run list --workflow=` command. GitHub answers a renamed workflow with its pre-rename runs instead of an error, so a stale name here reads as "no run yet" on every release and never verifies anything.
- The working tree is clean: `git status --porcelain` is empty.

### Stable

- On `main` and up to date: `git checkout main && git pull --ff-only`.
- The `ci.yml` push run for the current `HEAD` passed: `gh run list --commit "$(git rev-parse HEAD)" --json workflowName,event,status,conclusion,url -q '.[] | select(.workflowName == "ci" and .event == "push")'`. Ask by commit, never `--workflow=ci.yml --branch=main -L 1`, which can answer with a run weeks older than `HEAD`.
  - A `HEAD` with no run yet, or a run still `in_progress`, means waiting. Say which and ask whether to wait for it.
  - Any `conclusion` other than `success` means `main` is broken. Report the run URL and stop.
  - That run is also the build check. `ci.yml`'s `e2e` job builds the app with electron-builder and launches it on macOS, Windows and Linux, so a green run at `HEAD` is what says the app still compiles on all three: the thing `release.yml` does next, at the most expensive place for it to fail. There is no second workflow to query; `build.yml` was deleted when its jobs moved here.
  - What it still doesn't cover: `e2e` builds `--dir` and unsigned, so installer packaging and macOS signing run for the first time in the release itself. That is a known risk of every release, not something to check here.
- There is something to release: the range from the last stable tag, from `gh release list --exclude-pre-releases -L 1`, to `HEAD` is non-empty.

### Beta

- On `beta` and matching `origin/beta`. `beta` is force-pushed after every rebase, so `git pull --ff-only` fails on a stale copy. Run `git fetch origin && git checkout beta`, check `git log --oneline origin/beta..beta` is empty so nothing local is lost, then `git reset --hard origin/beta`.
- `beta` contains all of `main`: `git merge-base --is-ancestor origin/main HEAD`. If it fails, `main` has commits `beta` lacks, and a beta cut now would ship without them. Stop and say `beta` needs rebasing first. The rebase follows `CLAUDE.md` and ends in a force-push, so it is a separate step the user approves, never part of this skill. After it, start again from the top.
- A `ci.yml` run for the current `HEAD` passed. Nothing pushes CI on `beta`, so the run is a dispatched one: `gh run list --commit "$(git rev-parse HEAD)" --json workflowName,event,status,conclusion,url -q '.[] | select(.workflowName == "ci" and .event == "workflow_dispatch")'`.
  - No run yet: start one with `gh workflow run ci.yml --ref beta`, then ask whether to wait for it. It runs at whatever `beta` points to when it starts, so query by commit again rather than trusting the newest run.
  - A run still `in_progress` means waiting. Any `conclusion` other than `success` means `beta` is broken; report the run URL and stop.
  - What a green run proves and what it leaves out is the same as for stable, above.
- There is something to release. The range runs from the build Beta users are on now, which is the higher version of the last prerelease (`gh release list --json tagName,isPrerelease -q '[.[] | select(.isPrerelease)][0].tagName'`) and the last stable (`gh release list --exclude-pre-releases -L 1`). Read it with `git log --oneline --cherry-pick --right-only --no-merges <previous>...HEAD`, never `<previous>..HEAD`. A rebase rewrote every `beta` commit since the previous beta was tagged, so a plain range lists them all again, and `--cherry-pick` drops the ones whose patch is unchanged. Ignore beta version commits in it; the range needs something else.

## Choose the version

### Stable

Read the `[Unreleased]` section of `CHANGELOG.md` first. Every user-facing change lands with a line there, so its subsections say most of what the release holds. Then read `git log --oneline <lastTag>..HEAD`, since a release usually runs to a few dozen commits, to catch a change that missed its line. Triage on subjects; open `gh pr view <number>` only for the few whose subject doesn't reveal whether users see the change.

- **patch**: the range holds nothing but fixes, refactors, docs, tests, CI, and dependency bumps. Also the answer when the only user-facing changes fix something already released (`3.56.1`, `3.56.2`, `3.56.3` were all this).
- **minor**: anything users gain or notice, such as a new feature, a new setting, a renamed or changed default, an Electron upgrade, or a feature promoted from `beta`. This is the usual answer.
- **major**: never propose one unprompted. It's for breaking changes, such as a config migration that drops data or dropping an OS. If the range looks like it contains one, say so and let the user decide.

Arguments naming a level or an explicit version override this triage. Take them, and still confirm.

### Beta

A beta version stays ahead of every stable, so a Beta user is never offered a stable as a downgrade and never sits behind one. It isn't triaged. It follows from the last stable `S` and the last prerelease `B`:

- When `B`'s version without its suffix is higher than `S`, the cycle continues: increment `N`. `3.64.0-beta.1` with `3.63.2` stable is followed by `3.64.0-beta.2`.
- Otherwise a new cycle starts at the minor after `S`: `3.63.1` stable gives `3.64.0-beta.1`, and once `3.64.0` ships the next is `3.65.0-beta.1`. Minor, because `beta` holds features, and so that a patch `main` cuts in the meantime stays below it.
- An explicit `-beta.N` version overrides this, as long as it is higher than `S` and than `B`. A major is taken only when asked.

## Confirm the version

Always confirm before editing `package.json`, even when the version is obvious.

- Show the current version, the proposed version and, for a stable, its level, the number of commits in the range, and the handful of user-facing commits that drive the choice, not the whole log. For a beta, also show `S` and `B`.
- Wait for an explicit yes. If the user names a different level or version instead, take it without re-arguing.

## Commit the version

- Edit `version` in the root `package.json`. Workspace packages stay at `0.0.0`, and `bun.lock` doesn't record the version.
- **Stable only:** empty the `[Unreleased]` section of `CHANGELOG.md`, deleting every entry and subsection under the heading so only `## [Unreleased]` remains. The lines are not promoted to a versioned section; the `release-notes` skill reads them from this commit's parent and puts them on the GitHub Release.
- **Beta:** leave `CHANGELOG.md` alone. On `beta`, `[Unreleased]` holds `main`'s pending lines and every unpromoted feature's, and each feature's line travels to `main` inside its own commit when it's promoted. Emptying it here would conflict at every rebase, and the next rebase drops this commit anyway.
- Don't reach for `npm version` or `bun pm version`, because they commit and tag on their own terms.
- Commit with the bare version as the subject, with no prefix and no body: `git commit -m "3.59.0"`, or `git commit -m "3.64.0-beta.1"`. The rebase of `beta` finds its version commits by that subject.
- `git push`. On `beta` too this is a fast-forward; never force-push from this skill.

## Create the release

- `gh release create v<version> --target "$(git rev-parse HEAD)" --notes ""`.
  - `--target` pins the tag to the version commit rather than wherever the branch has drifted to.
  - For a Beta release, add `--prerelease`. It keeps the release off `/releases/latest`, so stable users never see it, and it makes `release.yml` publish `beta*.yml` update metadata instead of `latest*.yml`.
  - Pass no `--title`. Every prior release leaves the title empty, so GitHub shows the tag.
  - Empty notes are deliberate, because the next step writes them. Don't pass `--generate-notes`.
- Never create it as a draft. `release.yml` triggers on `released` or `prereleased` only, so a draft never builds.
- **Never promote a beta by unticking "pre-release" on its GitHub release.** Editing a prerelease into a release makes GitHub send `released`, and `/releases/latest` moves onto it. Without the `channel` job, which fails that run, `release.yml` would rebuild with `github.event.release.prerelease` false and publish `latest*.yml` carrying the `-beta.N` version, offering stable users a Beta build. Even with it, stable users' checks error while `/releases/latest` points at a release with no `latest*.yml`, so put the flag back at once. Features reach stable by promotion to `main` and a stable release cut there.

## Notes and reporting

- Run the `release-notes` skill. It expects `HEAD` to be the version commit and writes onto the `v<version>` release, which now exists.
- Report the release URL and the release build's run URL (`gh run list --workflow=release.yml -L 1 --json url,status`). Don't wait for the build, which takes many minutes across three platforms.
- Re-running a single failed platform job is safe, however long after the release it happens. `release.yml` sets `EP_GH_IGNORE_TIME`, which turns off electron-publish's refusal to upload into a release published more than two hours earlier. Without it the rebuild uploads nothing for that platform and still reports success.

## After a stable release

Check whether `beta` holds work `main` doesn't: `git fetch origin && git log --oneline --cherry-pick --right-only --no-merges origin/main...origin/beta`, ignoring beta version commits. If it does, say a beta is due, and why, then offer to rebase `beta` and cut one:

- A stable lower than the current beta, such as `3.63.2` under `3.64.0-beta.1`, strands Beta users. The updater stops at the newest release in the feed, declines it as older than what they run, and never looks past it to the prerelease behind it, so they get neither the fix nor any later beta until a prerelease is published after the stable.
- A stable at or above the current beta, such as `3.64.0` over `3.64.0-beta.2`, moves Beta users onto it, and with it off every feature that wasn't promoted, until the next beta brings them back.

Either way the fix is the same: rebase `beta` onto the new `main`, run CI on it, and cut the next beta, which the version rule above puts ahead of the stable.
