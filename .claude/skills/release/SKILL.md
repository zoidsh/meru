---
name: release
description: Cut a Meru release. Use when asked to release, cut a release, ship a version, or bump the version.
argument-hint: [major|minor|patch]
---

# Release

The version commit goes straight onto `main` — no branch, no PR. Publishing the release fires `.github/workflows/release.yml`, which reruns CI and builds and uploads the macOS, Windows and Linux artifacts, so a release is only cut off a `main` that already passes CI.

## Preconditions

Check all of these first. If one fails, report it and stop — never work around it.

- On `main`, clean and up to date: `git status --porcelain` empty, then `git checkout main && git pull --ff-only`.
- The last `main` workflow run is for the current `HEAD` and passed: `gh run list --workflow=main.yml --branch=main -L 1 --json headSha,status,conclusion,url`.
  - `headSha` must equal `git rev-parse HEAD`. A `HEAD` with no run yet, or a run still `in_progress`, means waiting — say which and ask whether to wait for it.
  - Any `conclusion` other than `success` means `main` is broken. Report the run URL and stop.
- There is something to release: the range from the last release's tag (`gh release list -L 1`) to `HEAD` is non-empty.

## Choosing the bump

Read `git log --oneline <lastTag>..HEAD` — a release usually runs to a few dozen commits. Triage on subjects; open `gh pr view <number>` only for the few whose subject doesn't reveal whether users see the change.

- **patch** — the range holds nothing but fixes, refactors, docs, tests, CI and dependency bumps. Also the answer when the only user-facing changes fix something already released (`3.56.1`, `3.56.2`, `3.56.3` were all this).
- **minor** — anything users gain or notice: a new feature, a new setting, a renamed or changed default, an Electron upgrade. This is the usual answer.
- **major** — never propose one unprompted. It is for breaking changes (a config migration that drops data, dropping an OS). If the range looks like it contains one, say so and let the user decide.

Arguments naming a level or an explicit version override this triage — take them, and still confirm.

## Confirming

Always confirm before editing `package.json`, even when the bump is obvious.

- Show the current version, the proposed version and its level, the number of commits in the range, and the handful of user-facing commits that drive the choice — not the whole log.
- Wait for an explicit yes. If the user names a different level or version instead, take it without re-arguing.

## Committing the bump

- Edit `version` in the root `package.json` and nothing else — workspace packages stay at `0.0.0`, and `bun.lock` doesn't record the version.
- Don't reach for `npm version` or `bun pm version`; they commit and tag on their own terms.
- Commit that one file with the bare version as the subject — no prefix, no body: `git commit -m "3.59.0"`.
- `git push`.

## Creating the release

- `gh release create v<version> --target "$(git rev-parse HEAD)" --notes ""`.
  - `--target` pins the tag to the version commit rather than wherever `main` has drifted to.
  - No `--title`: every prior release leaves the title empty so GitHub shows the tag.
  - Empty notes are deliberate — the next step writes them. Don't pass `--generate-notes`.
- Never create it as a draft. `release.yml` triggers on `released`/`prereleased` only, so a draft never builds.

## Notes and reporting

- Run the `release-notes` skill. It expects `HEAD` to be the version commit and writes onto the `v<version>` release, which now exists.
- Report the release URL and the release build's run URL (`gh run list --workflow=release.yml -L 1 --json url,status`). Don't wait for the build — it takes many minutes across three platforms.
