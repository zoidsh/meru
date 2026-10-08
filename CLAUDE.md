# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Meru is an Electron desktop client for Gmail and Google Workspace, sold with a Pro tier. The code is public here; plans and working docs are private, in the folder the session-start hook names. Read its `architecture/overview.md` before touching `packages/app`, and check its `decisions.md` before relitigating a design choice. Where this file and those docs overlap, the docs win.

## Commands

`mise.toml` pins bun and node, so setup is `mise install` and then `bun install --frozen-lockfile`; CI gets the same versions from `jdx/mise-action`. Lefthook formats and lint-fixes staged files at every commit.

| Task                                    | Command                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| Run the app with rebuild-on-change      | `bun run dev`, flags below                                   |
| Format / check formatting               | `bun run fmt` / `bun run fmt:check`                          |
| Lint / lint with fixes                  | `bun run lint` / `bun run lint:fix`                          |
| Typecheck every package                 | `bun run types`                                              |
| Unit tests                              | `bun test --isolate`                                         |
| One unit test file                      | `bun test --isolate packages/shared/tabs.test.ts`            |
| One test by name                        | `bun test --isolate -t "name"`                               |
| End-to-end suite (builds the app first) | `bun run test:e2e`; on Linux `xvfb-run -a bun run test:e2e`  |
| Build for one platform                  | `bun run build:mac` / `build:linux` / `build:win`            |
| Signed, notarised macOS build           | `op run --env-file .env.signing.op -- bun run build:mac`     |
| Signed arm64 DMG to test locally        | `op run --env-file .env.signing.op -- bun run build:mac:dmg` |

`build:mac:dmg` builds only the arm64 DMG and skips notarisation and the signing timestamp, so it is minutes faster, and the result opens only on a Mac it reached without quarantine, such as by `scp`. Never ship it.

`bun run dev` takes `--devtools` to open devtools, `--debug-port 9222` to expose CDP, and `--profile <name>` to use `.meru/<name>` as the user data directory, so a signed-in account survives between runs. Any other option goes to Electron as typed, such as `--disable-gpu`. A development run is the free version, `op run --env-file .env.trial.op -- bun run dev` has seven days of trial left, and `op run --env-file .env.license.op -- bun run dev` is licensed. Its entitlement follows the environment alone: without `MERU_LICENSE_KEY` the stored key is removed, so a key activated in Settings lasts only until the next start, and without `MERU_DEV_DEVICE_ID` the API is never asked about a trial.

Several worktrees run it at once, with nothing to pass. The renderer serves on the next free port from 3000, or on `PORT` when something outside assigns one, and Electron is handed the address the server came up on. A run in a linked worktree takes a profile named after its branch unless `--profile` names one, which gives it a user data directory and a single instance lock of its own; the main checkout keeps the default directory and the accounts signed in to it. `--debug-port 0` leaves the port to Chromium and prints what it picked. The docs' `conventions.md` has the rest.

Checks by cost: `bun run lint && bun run types` in the edit loop; `fmt:check`, `lint`, `types` and `bun test --isolate` before a pull request, since each is a CI job; the end-to-end suite is what CI adds on top, on all three platforms.

End-to-end details: `MERU_SKIP_BUILD=1` reruns against the build already in `dist`, `MERU_EXECUTABLE` points at any built app, and extra arguments pass through to Playwright. The suite's license key and signed-in account come from 1Password, below. Test files are `*.e2e.ts`, never `*.spec.ts`, because `bun test` would claim that name.

## Branches

- `main` is releasable at every commit, and stable releases are cut from it. `beta` is `main` plus the features not yet proven, and Beta releases are cut from it. The `release` skill holds the version rules for both.
- A feature pull request targets `beta` and lands squashed, its changelog line in the same commit. A fix to something already on `main` targets `main` and reaches `beta` at the next rebase.
- No branch ever gets a merge commit. `beta` is kept current by rebasing it onto `main` and force-pushing. Run it from the root of a worktree of its own, detached, never in the main checkout, whose `HEAD` other sessions share. `scripts/beta-rebase.ts` is the sequence editor. It drops beta version commits, which only bump `package.json` and would conflict with every stable's, and every commit whose subject landed on `main` since `beta` was last based on it, which is how promoted commits leave. Its `check` refuses a rebased `beta` that still holds a commit whose subject is on `main`; stop there and find out why rather than pushing:

  ```sh
  git fetch origin && git checkout --detach origin/beta
  GIT_SEQUENCE_EDITOR="bun $PWD/scripts/beta-rebase.ts todo" git rebase -i --empty=drop origin/main
  bun scripts/beta-rebase.ts check
  git push --force-with-lease=beta origin HEAD:beta && gh workflow run ci.yml --ref beta
  ```

  A `CHANGELOG.md` conflict resolves to the file as it stands at that point in the rebase, `HEAD`, plus the lines this one commit adds. Taking `main`'s file instead would lose the lines of features already replayed in the same rebase. An open pull request into `beta` then moves across with `git rebase --onto origin/beta <old>`, where `<old>` is the commit `origin/beta` pointed at before the push.

- A feature that has proven itself on Beta is promoted to `main`.
  - Rebase `beta` just before, so its commits sit on `main`'s tip. If they aren't the oldest on `beta`, reorder them with a second rebase after the scripted one and its `check`, before the push: `git rebase -i origin/main` with the default editor, moving their `pick` lines to the top.
  - Open a pull request into `main` from a branch at the newest of them, and keep the commits' subjects as they are.
  - It merges only at `main`'s tip: `gh pr view <n> --json mergeStateStatus` must not read `BEHIND`. When `main` has moved, or the pull request conflicts, rebase `beta` onto `main` again and push the promotion branch at the rebased commits, or reopen the pull request from them. Never use GitHub's **Update branch**, which makes a merge commit, and never fix the pull request branch alone, which leaves `beta` with a different patch for the same commit.
  - It lands with **Rebase and merge**, never squash, so each commit keeps its subject and its patch. Rebase `beta` straight after; the sequence editor drops the promoted commits.
  - Beta version commits never reach `main`.
  - A promotion reverted on `main` still leaves its subjects there, so the next rebase drops the feature from `beta` too. Bring it back by landing it again as a new pull request into `beta`.

## Architecture

Bun workspaces monorepo. `scripts/build.ts` bundles the main process, the three preloads and the extension scripts with rolldown and the renderer with Vite, all into `build-js/`. In `bun run dev`, the renderer is a Vite dev server and everything else rebuilds and restarts Electron on change.

Packages, by process:

- `@meru/app` (main): windows, views, accounts, config, IPC, menu, tray, updater, licensing. Entry `packages/app/index.ts`; `@/*` resolves to `packages/app/*`.
- `@meru/renderer`: React UI for what Meru draws itself, which is the titlebar, vertical tabs, settings, unified inbox and popups.
- `@meru/preload-gmail`, `@meru/preload-workspace-app`, `@meru/preload-renderer`: one preload per kind of view. The Gmail preload is one file per feature, wired only in its `index.ts`.
- `@meru/shared`: the contract layer. `types.ts` holds the config type and the IPC channel maps; `renderer/ipc.ts` is the typed client used by the renderer and the content preloads.
- `@meru/electron-extensions`: app-agnostic Chrome extension support; app glue lives in `packages/app/extensions.ts`.
- `@meru/ui` (shadcn-style components) and `@meru/dark-theme` are leaves.

Dependencies point inward on `@meru/shared`; nothing imports `@meru/app`.

Things that take more than one file to see:

- **One window, child views.** A single BrowserWindow loads `renderer/main.html`. Each Gmail account and each embedded workspace app is a `WebContentsView` on `main.window.contentView`, positioned into the rectangle left after the renderer's titlebar and vertical tabs strip. Every child view comes from `createChildWebContentsView()` in `packages/app/lib/web-contents.ts`. Child views paint over renderer HTML, so any overlay over view content is a native `Menu.popup` or a `Popup` from `packages/app/lib/popup.ts`; renderer-drawn dropdowns stay inside the strips. Routes other than `/` hide every view so the renderer page shows.
- **Main-process object model.** Everything in `packages/app` is a module-level singleton except `Account`, `Gmail`, `Tabs`, `WorkspaceApp`, `DormantTab` and `Popup`. `Account` owns a partitioned session, a `Gmail` and a `Tabs`; the Gmail tab is a getter proxy onto `Gmail` and can never close; other tabs are live `WorkspaceApp`s or `DormantTab`s materialized on demand. Tab ordering lives in `@meru/shared/tabs` so main and renderer agree.
- **Startup order** is `init()` in `packages/app/index.ts`: license or trial validation, then the extension prunes, then `accounts.init()`, then `main.init()`. `Gmail` instances exist before the window does, and nothing may delete an extension install or derived copy after `accounts.init()`.
- **Config is the event bus.** One flat `electron-store` in `packages/app/config.ts` with literal `"section.camelCase"` keys plus a nested `accounts` array. Main reads and writes it directly and registers `config.onDidChange` listeners once at collection level, never per instance. The renderer reads through `useConfig()` and writes through `useConfigMutation()`, and the `config.configChanged` push is its only refresh. Everything else main pushes to the renderer is a zustand store in `packages/renderer/lib/stores.ts`, seeded for first paint from the window's URL search parameters.
- **IPC** is typed over `@electron-toolkit/typed-ipc`. Channel maps are declared once in `packages/shared/types.ts`, handlers register in `ipc.init()` in `packages/app/ipc.ts`, and names follow `domain.verbNoun`.

## Environment

- Code and `package.json` scripts read plain environment variables and never call `op`. Maintainers take them from 1Password with `op run --env-file <file> -- <command>`; contributors put their own in a gitignored `.env`, from the names in `.env.example`; CI passes GitHub secrets.
- The `.env.<scope>.op` files are scoped, so a command resolves only what it needs: `.env.signing.op` signs a macOS build, `.env.e2e.op` has the end-to-end suite's license key and signed-in account, and `.env.license.op` and `.env.trial.op` give `bun run dev` a license or a trial. Never wrap a build in `.env.trial.op`, which `build:js` would inline as `MERU_DEV_DEVICE_ID`, or the end-to-end suite in `.env.license.op`, whose `MERU_LICENSE_KEY` would license every app it launches.
- A signing environment is all or none, checked by `scripts/signing-env.ts`: electron-builder signs with whatever part it finds and skips the rest with a log line. `build:mac` runs the check first, and `build-win.ts` builds unsigned without the Azure values. `test:e2e` strips the macOS values from the build it makes, so the suite can run beside them.
- Quote an `op://` path that contains a space.
- Bun loads `.env` for every command, and `.env.development.local` for `bun run dev`, which `build:js` avoids by pinning `NODE_ENV=production`. `.env.<scope>.op` and `.env.example` are names Bun never loads.

## Boundaries

- Add packages with `bun add -d`. Everything is bundled, and electron-builder would ship a runtime `dependencies` entry a second time. The one exception is a native module Electron loads at runtime.
- Style lands as a rule in `@timche/oxc-configs`, checked out at `~/oxc-configs` and extended by `oxlint.config.ts`, never as a sweep inside a feature pull request. New code matches its neighbors until a rule lands.
- Ask before bumping Electron or electron-builder. CI builds unsigned, so signing and installer packaging first run in the release itself.
- Ask before adding a config migration to the ladder in `packages/app/config.ts`. Every migration guards every key it reads and branches on a legacy key, never on a value equal to a default. An unguarded read bricked every fresh install of a 3.60 beta, and only a release build runs a new migration. Nothing runs the ladder against an empty store, so the guards are held by review alone.
- Ask before touching licensing, the trial, Pro gating or the settings behind them. Plan decisions span both repositories.
- Never bump the version, tag or cut a release. That is the `release` skill, run by Tim, and the updater ships whatever is tagged.
- Never put a value resolved from 1Password, the test license key included, in a commit, comment or pull request.
- A writing-style pass leaves marketing and identity copy alone: taglines, product descriptions, the README header, the package `description`. Raise a line that breaks a rule as a question instead of editing it.

## Practices

- Durations come from `ms` in `@meru/shared/ms`, never the `ms` package.
- A user-visible change adds one line to the `[Unreleased]` section of `CHANGELOG.md`, under `Added`, `Changed` or `Fixed`, written for users in the style of the `release-notes` skill. The line lands in the same commit and pull request as the change, not in a follow-up. Refactors, tests, CI, docs and dependency bumps other than Electron get no line. The file holds only that section: a stable version commit empties it, a beta one leaves it, and the `release-notes` skill moves the lines onto the GitHub Release, so never add a versioned section.
- Before attaching a listener to a `webContents` or emitter, grep the file for that event on the same target and add the work to the existing handler. Listeners that attach and detach independently stay separate.
- Platform branches use `platform` from `@electron-toolkit/utils` in main and from `@/lib/utils` in the renderer. A cross-platform accelerator uses `CommandOrControl` and `Alt`; a bare `Command` or `Option` is honored on macOS only and fails silently elsewhere.
- Renderer: `packages/ui` components follow shadcn conventions and many are compound, so read the component file and use its sub-components instead of `<div>` wrappers. Merge conditional classes with `cn` from `@meru/ui/lib/utils`. Keyboard keys in copy render through `Kbd`. A config-backed settings field is `ConfigSwitchField` for a boolean key or `ConfigSelectField` for a string-union key; a fixed set of named choices is a string union, not a boolean.
- Interface text follows the `ui-writing` skill.
- Behavior specific to a platform other than the one the session runs on, such as macOS accelerators, menus or signing from Linux, cannot be verified. Do what can be done and say so under a `## Not verified` heading.
