# Staging releases

This is `zoidsh/meru-staging`, a throwaway copy of `zoidsh/meru` that exists
only to cut releases nobody installs by accident.

**Nothing here may ever be merged back into `zoidsh/meru`.** The one change that
matters would redirect real Meru releases and every shipped updater away from
`zoidsh/meru` and into this repository.

## What it is for

The auto-update path is proven only as far as channel resolution:
`packages/app/lib/update-channel.test.ts` on `zoidsh/meru`'s `main` runs the
real `AppUpdater` and `GitHubProvider` against a fake GitHub over HTTP. What
that harness cannot reach is the per-target download and install — the macOS zip
through Squirrel.Mac, the Windows NSIS installer, the Linux AppImage — and
beta-to-stable promotion, which in the real repository would mean shipping a
stable release to every user just to watch a Beta user converge onto it.

Built and released here, the app checks this repository for updates instead, so
releases can be cut as often as needed with no user-facing consequence.

## Branches

`main` is `zoidsh/meru`'s `v3.59.0` tag, unmodified apart from the redirect
below. Genuine 3.59.0, not `main` with the version number changed: the point of
a baseline is that it is the code users are actually running, down to the
config store the `>=3.60.0` migration will find when it runs.

`3.60-staging` is `zoidsh/meru`'s `main` at `3.60.0-beta.1`, carrying the same
redirect plus the release-channel work. Release channels do not exist in 3.59.0
— no `updates.channel` key, no Beta select, no `update-channel.ts` — so a
3.59.0 install cannot opt into Beta at all. It tests the stable ladder;
`3.60-staging` is the baseline for anything involving the Beta channel.

## How it differs from `zoidsh/meru`

| File                                                    | Change                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                          | `build.publish` names `owner: zoidsh` and `repo: meru-staging` explicitly rather than leaving electron-builder to infer them from `repository`. This is the change that redirects the updater: the feed is baked into `app-update.yml` at build time, and that file is what the shipped app reads. |
| `packages/renderer/routes/settings/version-history.tsx` | Reads this repository's releases, so the Version History page lists the same releases the updater resolves.                                                                                                                                                                                        |

Nothing else naming `zoidsh/meru` reaches the update path: `GITHUB_REPO_URL` in
`packages/shared/constants.ts` is only the Help menu's GitHub link.

`.github/workflows/` is untouched. `release.yml` fires on `release:
[prereleased, released]`, which is why it has to live here rather than in
`zoidsh/meru` — that event only fires in the repository hosting the release, and
here the built-in `secrets.GITHUB_TOKEN` publishes to its own releases with no
PAT. Its `needs: ci` gate is harmless at this tag: 3.59.0's `ci.yml` has no
`e2e` job, so nothing wants `MERU_TEST_LICENSE_KEY`.

## Things to know before testing

- **This repository must stay public.** electron-updater's GitHub provider reads
  the feed and the assets anonymously; against a private repository the check
  404s. The `private: true` publish option authenticates through the API
  instead, which is a different code path from the one under test.
- **A staging build collides with a real Meru install.** `appId` is still
  `sh.zoid.meru`, so it installs over the real app and shares its `userData`
  directory and configuration. It cannot be changed: the macOS provisioning
  profile authorizes the Touch ID keychain access group entitlement for that
  exact bundle identifier. Install on a VM or a spare machine, never on a
  working install — an installed staging build keeps checking this feed until
  it is reinstalled from a real release.
- **macOS needs a matching signature.** Squirrel.Mac refuses an update whose
  signature does not match the running app, so an unsigned build cannot
  exercise the macOS install path. The Apple signing secrets therefore live
  here as repository secrets, accepting that this is a public repository.
  GitHub does not expose secrets to workflows triggered from forked pull
  requests.
- **`EP_GH_IGNORE_TIME` is not set at this tag.** It arrived after 3.59.0.
  `GitHubPublisher` refuses to upload into a release published more than two
  hours ago and exits zero having uploaded nothing, so re-running a failed
  platform job later gives a green run with no assets. Cut a fresh tag instead.
