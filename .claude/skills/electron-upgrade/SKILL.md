---
name: electron-upgrade
description: Upgrade Meru's Electron within its current major. Use when asked to upgrade, update or bump Electron, or to take a new Electron minor or patch release.
argument-hint: [version]
---

# Electron upgrade

A same-major Electron upgrade, minor or patch, is a mechanical task: the version is picked by a script, the procedure below checks what it can reach in Meru, and it ends in a pull request into `main`. Run under the `lead` skill, it skips plan approval and goes straight to the pull request. When it needed a fix beyond the bump, the report leads with that fix.

The same procedure runs whether or not the brief names a version, so every upgrade takes its release under the same rules.

## Scope

- Same major only. A new major stops here and goes to Tim: it gets a trial branch and a write-up of its breaking changes first, which this skill does not cover. The script names a new major when one is out and never offers it.
- Electron alone. electron-builder is not part of it and keeps its own ask-first rule in `CLAUDE.md`.

## Pick the target

Run `bun scripts/electron-upgrade.ts`. It reads the version `bun.lock` resolves and npm's publish times and published versions, and prints the newest stable release in the major `bun.lock` resolves once it has been on npm for 24 hours. Exit 1 means there is nothing to take, with the reason on stderr: already current, or held because the newest release is younger than 24 hours, even when an older one is old enough, since a quick successor suggests the older one had a problem. Report the reason and stop. Exit 2 is an error; report it and stop.

A version named in the brief must pass the same rules: run the script, and take the named version only if it is what the script prints. Otherwise say why not and stop.

## Set up

- In a worktree of its own, off `origin/main`, then `bun install --frozen-lockfile`.
- Print the installed Electron with `node -p 'require("electron/package.json").version'` before and after the bump, and read the built app's own versions too. A worktree's `node_modules` can hold a different Electron from the lock, so the proof states the version that ran, not the one declared. CDP `/json/version` does not show it, since Meru's user agent drops the `Electron/` token. On any platform, launch the build with `--remote-debugging-port=0` and evaluate `window.electron.process.versions` in the `main.html` target, which the renderer preload exposes and which works on a release build too; the VM docs' `cdp.py` is a client for it. The `test:e2e` build leaves the inspect fuse on, so `--inspect=0` also lets `process.versions` be read in the main process. On macOS, `CFBundleVersion` in `Contents/Frameworks/Electron Framework.framework/Resources/Info.plist` reads it without launching.
- Before the bump, take the baseline in the same session: `bun test --isolate` and `op run --env-file .env.e2e.op -- bun run test:e2e`, with their counts. Never compare against a remembered number.

## Assess

- Read the notes of every release between the current version and the target, not only the target's: `gh release view v<version> -R electron/electron`.
- Read the open upstream issues labelled `<major>-x-y`: `gh issue list -R electron/electron --label <major>-x-y --state open`.
- Check whether each issue behind a Meru workaround is still open or fixed. List them fresh each run: `git grep -nE "electron(/electron)?(#|/issues/)[0-9]+" -- packages` for those the code names, plus those the latest `$PROJECT_DOCS_DIR/zoidsh/meru/electron-<major>-upgrade.md` lists without a number in the code, such as electron#53522 (swipe events) and electron#54743 (a drag region that survives navigation). A fixed one makes its workaround removable, as a change of its own, not in this pull request.
- Class every note as reaches Meru or checked and not applicable, against this list of where Electron reaches Meru:
  - Extension namespaces. A namespace Electron newly answers natively shadows the facade, which fills only missing ones. A behaviour change in a namespace already native, such as `storage` or `alarms`, never shows in the probe's `typeof` diff, so the notes are the only source.
  - Permission names in the `setPermissionRequestHandler` and `setPermissionCheckHandler` of `packages/app/account.ts` and `packages/app/extensions.ts`. A renamed or new permission is refused by default.
  - Globals available to sandboxed preloads.
  - The fuse schema against `electronFuses` in `package.json`.
  - asar handling and the swipe addon, which is `asarUnpack`ed and Node-API.
  - `window.open`, `createWindow` options and child views from `createChildWebContentsView()`.
  - `WebContentsView` visibility, stacking and lifecycle, on Linux above all, where a wrong view can pass CI on all three platforms.
  - The updater: Squirrel.Mac and ShipIt on macOS, NSIS on Windows, AppImage on Linux.
  - Notifications, the tray and the clipboard.
  - The toolchain: the lock keeps Playwright at 1.62.1, since later versions can lose a packaged app's first window (microsoft/playwright#43247), and electron-builder and `@electron/fuses` must still build and fuse the new binary.

## Probe, bump and fix

- Run `bun scripts/probe-extension-api.ts` before the bump, saving its output to a scratch file, then again after it, and diff the two. A changed row is a finding and goes into `$PROJECT_DOCS_DIR/zoidsh/meru/architecture/chrome-api-conformance.md`. A clean diff is necessary, not sufficient.
- Bump with `bun add -d 'electron@^<version>'`. A bare `electron@<version>` writes the exact version, so check `package.json` reads `^<version>`. The bump is one commit.
- Each fix the upgrade needs is a commit of its own, naming the upstream issue or pull request in its message.

## Check

- `bun run fmt:check`, `bun run lint`, `bun run types`, `bun test --isolate`, and `op run --env-file .env.e2e.op -- bun run test:e2e`. Compare the counts with the baseline; a new failure or skip is a finding, not noise.
- CI runs the end-to-end suite on macOS, Windows and Linux, so whatever an end-to-end test covers is proven on all three there.

## The VM round

Every upgrade verifies everything this Mac can, on the host and in the macOS, Windows and Linux VMs. How to run each VM, get a build in and drive it is in `$PROJECT_DOCS_DIR/zoidsh/meru/macos-vm.md`, `windows-vm.md` and `linux-vm.md`. Each VM signs the test account in itself; a copied profile signs Google out.

The round lists only what no end-to-end test covers. A check that gains an end-to-end test leaves this list in the same pull request as the test.

- **Host:** a Meet screen share from a Gmail view opens Meru's picker, returns a live track, and a real meeting reaches **You are presenting**.
- **macOS**, a fresh clone of the base VM with a signed, unnotarised arm64 DMG from `op run --env-file .env.signing.op -- bun run build:mac:dmg`:
  - `codesign --verify --deep --strict` passes, `spctl` reads `source=Developer ID`, and the app reports the target version.
  - The fuses read as shipped; `--inspect` and `ELECTRON_RUN_AS_NODE` are ignored.
  - The swipe addon loads.
  - An update between two signed builds of the branch, versioned apart in a throwaway worktree, installs through ShipIt, relaunches signed on the target and keeps the channel.
  - Sign-in, the signed-in inbox, and switching to a second account and back.
- **Windows**, arm64 natively and x64 under emulation:
  - Both report the target version and render the signed-in inbox.
  - Switching accounts with real clicks and typing keeps each view's state.
  - Minimize and restore, close to tray and restore, quit and relaunch, and silent uninstall.
  - The fuses read as shipped, and `--inspect`, `ELECTRON_RUN_AS_NODE` and `NODE_OPTIONS` are ignored, against an unfused control.
  - Open at login round-trips, also at a path with a space.
  - An arm64 update to a released build keeps the channel.
- **Linux**, `meru-linux` on arm64 and a throwaway `meru-linux-x64`:
  - The AppImage and the deb render the signed-in inbox; the AppImage, deb and rpm read the shipped fuses.
  - Two accounts under X11: after launch, every switch, and minimize and restore, the selected account's view is the one shown, its `document.visibilityState` is `visible` and the other's `hidden`, and real `xdotool` clicks and typing land in it.
  - Close to tray and a second launch's handoff, and several cold starts.
  - A new-mail notification carries its buttons over D-Bus, and **Mark as Read** reaches Gmail.
  - Under headless sway with `--ozone-platform=wayland`, the first launch maps the window, and keyboard and pointer input work.
  - X11 paste does not hang.
  - The AppImage updates to a released build.
  - x86_64 reports `(x64)`, reads the same fuses and renders two accounts.

Under `## Not verified` goes only what this Mac cannot do: Touch ID and Bitwarden biometric unlock, Meet with camera and microphone and through the macOS system picker, a notarised build under Gatekeeper with quarantine, Windows Azure signing, and whatever the VM docs record as impossible here.

## Changelog

- `[Unreleased]` holds one line under `Changed`, "Updated to Electron <major>, which brings Chrome <Chromium major> and its security fixes", naming the major the branch is on. The bump commit adds it when it is missing, as it is once a stable release has emptied the section, and corrects one that names an older major.
- Any other user-visible change the upgrade brings gets a line of its own, under `Added`, `Changed` or `Fixed` as `CLAUDE.md` assigns them, in the same commit as that change.

## Record

Add a section for the target to `$PROJECT_DOCS_DIR/zoidsh/meru/electron-<major>-upgrade.md`: the versions with Chromium and Node, what reaches Meru, the check and end-to-end results, and the VM round. Edit it with Read, Edit and Write only, never `sed` or a shell redirection, since other sessions share the docs.

## Pull request

- Into `main`. Title `Upgrade Electron to <version>`, followed by `, <the user-visible fix>` when there is one.
- Body: a summary; what reaches Meru, and what was checked and is not applicable; the proof, with the running version before and after and the check and end-to-end counts against the baseline; the VM round's results; `## Not verified`; risk and how to revert.
- It merges only once CI has passed on macOS, Windows and Linux.

## When an upgrade finds a new kind of break

Land an end-to-end test that catches it, wherever one can, and add a line to the list under Assess, both in the same pull request. A break only a VM can show adds its check to the VM round instead.
