---
name: release
description: Cut a Meru release. Use when asked to release, cut a release, ship a version, or bump the version.
argument-hint: [major|minor|patch|experimental]
---

# Release

The version commit goes straight onto `main` — no branch, no PR. Publishing the release fires `.github/workflows/release.yml`, which reruns CI and builds and uploads the macOS, Windows, and Linux artifacts, so a release is only cut off a `main` that already passes CI.

## Preconditions

Check all of these first. If one fails, report it and stop — never work around it.

- On `main`, clean and up to date: `git status --porcelain` empty, then `git checkout main && git pull --ff-only`.
- The last `main` workflow run is for the current `HEAD` and passed: `gh run list --workflow=main.yml --branch=main -L 1 --json headSha,status,conclusion,url`.
  - `headSha` must equal `git rev-parse HEAD`. A `HEAD` with no run yet, or a run still `in_progress`, means waiting — say which and ask whether to wait for it.
  - Any `conclusion` other than `success` means `main` is broken. Report the run URL and stop.
- There is something to release: the range from the last release's tag to `HEAD` is non-empty. For a stable release that's the last stable tag, from `gh release list --exclude-pre-releases -L 1`. For an experimental release it's the last release of any kind, from `gh release list -L 1`.

## Choose the bump

Read `git log --oneline <lastTag>..HEAD` — a release usually runs to a few dozen commits. Triage on subjects; open `gh pr view <number>` only for the few whose subject doesn't reveal whether users see the change.

- **patch** — the range holds nothing but fixes, refactors, docs, tests, CI, and dependency bumps. Also the answer when the only user-facing changes fix something already released (`3.56.1`, `3.56.2`, `3.56.3` were all this).
- **minor** — anything users gain or notice: a new feature, a new setting, a renamed or changed default, an Electron upgrade. This is the usual answer.
- **major** — never propose one unprompted. It's for breaking changes, such as a config migration that drops data or dropping an OS. If the range looks like it contains one, say so and let the user decide.

Arguments naming a level or an explicit version override this triage — take them, and still confirm.

## Experimental releases

An `experimental` argument, or an explicit `-alpha.N` version, cuts a prerelease for the Experimental update channel instead of a stable release. Only cut one when asked — never propose one unprompted.

The channel is named Experimental in the app and versioned `alpha` on the wire, so the interface says Experimental everywhere the version string says `-alpha.N`. That seam is deliberate, and the version suffix is never `-experimental.N`. The reasoning is in `docs/decisions.md` under "The prerelease channel is named Experimental and versioned as `alpha`".

- The version is the next stable version per the triage above with `-alpha.N` appended: the first experimental release of a cycle is `X.Y.Z-alpha.1`. Each further one before that stable ships increments `N`.
- Everything else follows the stable flow, with two differences: `gh release create` gets `--prerelease`, and the triage range runs from the last release of any kind, not the last stable.
- Promoting an experimental release to stable is the normal stable flow with the suffix dropped, as in `3.60.0-alpha.2` → `3.60.0`. Experimental users are moved onto the stable build automatically.

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
  - For an experimental release, add `--prerelease`. It keeps the release off `/releases/latest`, so stable users never see it, and it makes `release.yml` publish `alpha*.yml` update metadata instead of `latest*.yml`.
  - Pass no `--title`. Every prior release leaves the title empty, so GitHub shows the tag.
  - Empty notes are deliberate — the next step writes them. Don't pass `--generate-notes`.
- Never create it as a draft. `release.yml` triggers on `released` or `prereleased` only, so a draft never builds.

## Notes and reporting

- Run the `release-notes` skill. It expects `HEAD` to be the version commit and writes onto the `v<version>` release, which now exists.
- Report the release URL and the release build's run URL (`gh run list --workflow=release.yml -L 1 --json url,status`). Don't wait for the build — it takes many minutes across three platforms.
