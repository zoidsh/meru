---
name: release
description: Cut a Meru release. Use when asked to release, cut a release, ship a version, or bump the version.
argument-hint: [major|minor|patch|beta]
---

# Release

The version commit goes straight onto `main` — no branch, no PR. Publishing the release fires `.github/workflows/release.yml`, which reruns CI and builds and uploads the macOS, Windows, and Linux artifacts, so a release is only cut off a `main` that already passes CI.

## Preconditions

Check all of these first. If one fails, report it and stop — never work around it.

- On `main`, clean and up to date: `git status --porcelain` empty, then `git checkout main && git pull --ff-only`.
- The workflow names below are real: `.github/workflows/` holds `ci.yml` and `release.yml`. Check that before running any `gh run list --workflow=` command — GitHub answers a renamed workflow with its pre-rename runs instead of an error, so a stale name here reads as "no run yet" on every release and never verifies anything.
- The last `ci.yml` run is for the current `HEAD` and passed: `gh run list --workflow=ci.yml --branch=main -L 1 --json headSha,status,conclusion,url`.
  - `headSha` must equal `git rev-parse HEAD`. A `HEAD` with no run yet, or a run still `in_progress`, means waiting — say which and ask whether to wait for it.
  - Any `conclusion` other than `success` means `main` is broken. Report the run URL and stop.
  - That run is also the build check. `ci.yml`'s `e2e` job builds the app with electron-builder and launches it on macOS, Windows and Linux, so a green run at `HEAD` is what says the app still compiles on all three — the thing `release.yml` does next, at the most expensive place for it to fail. There is no second workflow to query; `build.yml` was deleted when its jobs moved here.
  - What it still doesn't cover: `e2e` builds `--dir` and unsigned, so installer packaging and macOS signing run for the first time in the release itself. That is a known risk of every release, not something to check here.
- There is something to release: the range from the last release's tag to `HEAD` is non-empty. For a stable release that's the last stable tag, from `gh release list --exclude-pre-releases -L 1`. For a beta release it's the last release of any kind, from `gh release list -L 1`.

## Choose the bump

Read `git log --oneline <lastTag>..HEAD` — a release usually runs to a few dozen commits. Triage on subjects; open `gh pr view <number>` only for the few whose subject doesn't reveal whether users see the change.

- **patch** — the range holds nothing but fixes, refactors, docs, tests, CI, and dependency bumps. Also the answer when the only user-facing changes fix something already released (`3.56.1`, `3.56.2`, `3.56.3` were all this).
- **minor** — anything users gain or notice: a new feature, a new setting, a renamed or changed default, an Electron upgrade. This is the usual answer.
- **major** — never propose one unprompted. It's for breaking changes, such as a config migration that drops data or dropping an OS. If the range looks like it contains one, say so and let the user decide.

Arguments naming a level or an explicit version override this triage — take them, and still confirm.

## Beta releases

A `beta` argument, or an explicit `-beta.N` version, cuts a prerelease for the Beta update channel instead of a stable release. Only cut one when asked — never propose one unprompted.

The channel is named Beta in the app and versioned `beta` on the wire, so the interface and the version string agree. The reasoning is in the project docs, in `decisions.md` under "The prerelease channel is named Beta".

- The version is the next stable version per the triage above with `-beta.N` appended: the first beta release of a cycle is `X.Y.Z-beta.1`. Each further one before that stable ships increments `N`.
- Everything else follows the stable flow, with two differences: `gh release create` gets `--prerelease`, and the triage range runs from the last release of any kind, not the last stable.
- Promoting a beta release to stable is the normal stable flow with the suffix dropped, as in `3.60.0-beta.2` → `3.60.0`. Beta users are moved onto the stable build automatically.

## Confirm the bump

Always confirm before editing `package.json`, even when the bump is obvious.

- Show the current version, the proposed version and its level, the number of commits in the range, and the handful of user-facing commits that drive the choice — not the whole log.
- Wait for an explicit yes. If the user names a different level or version instead, take it without re-arguing.

## Commit the bump

- Edit `version` in the root `package.json` and nothing else — workspace packages stay at `0.0.0`, and `bun.lock` doesn't record the version.
- Don't reach for `npm version` or `bun pm version`, because they commit and tag on their own terms.
- Commit that one file with the bare version as the subject — no prefix, no body: `git commit -m "3.59.0"`.
- `git push`.

## Create the release

- `gh release create v<version> --target "$(git rev-parse HEAD)" --notes ""`.
  - `--target` pins the tag to the version commit rather than wherever `main` has drifted to.
  - For a beta release, add `--prerelease`. It keeps the release off `/releases/latest`, so stable users never see it, and it makes `release.yml` publish `beta*.yml` update metadata instead of `latest*.yml`.
  - Pass no `--title`. Every prior release leaves the title empty, so GitHub shows the tag.
  - Empty notes are deliberate — the next step writes them. Don't pass `--generate-notes`.
- Never create it as a draft. `release.yml` triggers on `released` or `prereleased` only, so a draft never builds.

## Notes and reporting

- Run the `release-notes` skill. It expects `HEAD` to be the version commit and writes onto the `v<version>` release, which now exists.
- Report the release URL and the release build's run URL (`gh run list --workflow=release.yml -L 1 --json url,status`). Don't wait for the build — it takes many minutes across three platforms.
