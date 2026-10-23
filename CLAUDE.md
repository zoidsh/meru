# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Meru is an Electron desktop client for Gmail and Google Workspace, sold with a Pro tier. The code is public here; plans and working docs are private, in the folder the session-start hook names. Read its `architecture/overview.md` before touching `packages/app`, and check its `decisions.md` before relitigating a design choice. Where this file and those docs overlap, the docs win.

## Commands

`mise.toml` pins bun and node, so setup is `mise install` and then `bun install --frozen-lockfile`. `mise.lock` holds the exact build for each CI runner's platform, and `jdx/mise-action` installs from it with `--locked`, which fails for a platform the file lacks; after changing a version in `mise.toml`, run `mise lock`, which refreshes every platform already in the file. Lefthook formats and lint-fixes staged files at every commit.

| Task                                    | Command                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| Run the app with rebuild-on-change      | `bun run dev`, flags below                                   |
| Format / check formatting               | `bun run fmt` / `bun run fmt:check`                          |
| Lint / lint with fixes                  | `bun run lint` / `bun run lint:fix`                          |
| Typecheck every package                 | `bun run types`                                              |
| Unit tests                              | `bun run test`                                               |
| One unit test file                      | `bun run test packages/shared/tabs.test.ts`                  |
| One test by name                        | `bun run test -t "name"`                                     |
| Extract strings into the catalogs       | `bun run i18n:extract`                                       |
| Compile the catalogs                    | `bun run i18n:compile`                                       |
| Check the catalogs                      | `bun run i18n:check`                                         |
| End-to-end suite (builds the app first) | `bun run test:e2e`; on Linux `xvfb-run -a bun run test:e2e`  |
| Build for one platform                  | `bun run build:mac` / `build:linux` / `build:win`            |
| Signed, notarised macOS build           | `op run --env-file .env.signing.op -- bun run build:mac`     |
| Signed arm64 DMG to test locally        | `op run --env-file .env.signing.op -- bun run build:mac:dmg` |

`build:mac:dmg` builds only the arm64 DMG and skips notarisation and the signing timestamp, so it is minutes faster, and the result opens only on a Mac it reached without quarantine, such as by `scp`. Never ship it.

`bun run test`, `types`, `dev` and `build:js` each compile the message catalogs first, because the compiled ones are not committed and nothing resolves `@meru/shared/i18n` without them. Plain `bun test --isolate` skips the compile, which is why the `test` script exists: it needs `bun run i18n:compile` run once first, and stops with that hint when the catalogs are missing. Its preload, `scripts/test-preload.ts`, compiles the Lingui macro in the modules under test with the build's transformer.

`bun run dev` takes `--devtools` to open devtools, `--debug-port 9222` to expose CDP, and `--profile <name>` to use `.meru/<name>` as the user data directory, so a signed-in account survives between runs. Any other option goes to Electron as typed, such as `--disable-gpu`. A development run is the free version, `op run --env-file .env.trial.op -- bun run dev` has seven days of trial left, and `op run --env-file .env.license.op -- bun run dev` is licensed. Its entitlement follows the environment alone: without `MERU_LICENSE_KEY` the stored key is removed, so a key activated in Settings lasts only until the next start, and without `MERU_DEV_DEVICE_ID` the API is never asked about a trial.

Several worktrees run it at once, with nothing to pass. The renderer serves on the next free port from 3000, or on `PORT` when something outside assigns one, and Electron is handed the address the server came up on. A run in a linked worktree takes a profile named after its branch unless `--profile` names one, which gives it a user data directory and a single instance lock of its own; the main checkout keeps the default directory and the accounts signed in to it. `--debug-port 0` leaves the port to Chromium and prints what it picked. The docs' `conventions.md` has the rest.

A run with `--background`, or with `MERU_BACKGROUND=1` in its environment, which `.claude/settings.json` sets for every Claude Code session in the repository, opens behind whatever is in front, coming forward only when someone brings it there, such as through Settings in its menu. Every end-to-end launch sets `MERU_TEST_BACKGROUND`, under which the app on macOS can never be activated, whatever a test asks of it; drive it over CDP, never by raising it.

Checks by cost: `bun run lint && bun run types` in the edit loop; `fmt:check`, `lint`, `types`, `bun test --isolate` and, after touching a string, `i18n:check` before a pull request, since each is a CI job; the end-to-end suite is what CI adds on top, on all three platforms.

End-to-end details: `MERU_SKIP_BUILD=1` reruns against the build already in `dist`, `MERU_EXECUTABLE` points at any built app, and extra arguments pass through to Playwright. The suite's license key and signed-in account come from 1Password, below. Test files are `*.e2e.ts`, never `*.spec.ts`, because `bun test` would claim that name. Every launch's account views load a page the suite serves itself, which `MERU_TEST_GMAIL_URL` points them at, so only the tests on a signed-in profile reach Gmail.

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
- Style lands as a rule in `@timche/oxc-configs`, extended by `oxlint.config.ts`, never as a sweep inside a feature pull request. New code matches its neighbors until a rule lands.
- Ask before bumping Electron or electron-builder. CI builds unsigned, so signing and installer packaging first run in the release itself.
- Three entries in `electronFuses` are not hardening, and changing them breaks the app:
  - `grantFileProtocolExtraPrivileges` stays on. It gates the loader that serves `file://` out of the asar, and the packaged renderer is a `loadFile` page, so without it the renderer gets `ERR_FILE_NOT_FOUND`.
  - `enableCookieEncryption` stays off. It is one-way: Chromium drops a whole eTLD+1 group rather than read a cookie it cannot decrypt, so the first downgrade past a release that turned it on signs every account out of Gmail.
  - `resetAdHocDarwinSignature` stays on. Flipping a fuse invalidates the signature, and an unsigned arm64 macOS build, the one `test:e2e` makes, is killed on launch without it.
- Ask before adding a config migration to the ladder in `packages/app/config.ts`. Every migration guards every key it reads and branches on a legacy key, never on a value equal to a default. An unguarded read bricked every fresh install of a 3.60 beta, and only a release build runs a new migration. Nothing runs the ladder against an empty store, so the guards are held by review alone. While a beta cycle is open, from a version's first beta until it ships as stable, a migration lands on `beta` keyed at the beta's own version, never on `main`. Conf records a `-beta.N` build as its plain version, so a migration from `main` would be skipped for every Beta user.
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
- Interface text matches its neighbours: native menus, the tray and context menus in title case on every platform, and everything the renderer draws in sentence case. The docs' `decisions.md`, under "Interface text", has the rest of the house calls.
- A user-visible string is wrapped in the Lingui macro in main and the renderer: `t` from `@lingui/core/macro` in main, `<Trans>` or `useLingui()`'s `t` from `@lingui/react/macro` in the renderer, since that `t` is bound to the provider's `i18n` rather than imported. The language is resolved once at startup, so one picked in Settings takes effect at the next start. The Gmail preload translates its own strings with `t` from `@lingui/core/macro`, from its own catalog in `packages/preload-gmail/locales`, which holds only its messages so a Gmail view doesn't load the app's; main passes it the language as `--meru-locale`. A short or ambiguous label, a bare action, a sentence fragment or a placeholder whose value is unclear takes a translator comment, through `t({ message, comment })` or `<Trans comment="…">`, and a block of strings that share one description can open with `// lingui-set comment="…"` and close with `// lingui-reset`. `context` only separates meanings of the same English, and a full sentence that explains itself needs neither. `bun run i18n:extract` writes the entries into `packages/shared/i18n/locales/en.po`, and the Gmail preload's into `packages/preload-gmail/locales/en.po`, both committed, unlike the compiled catalogs beside them. CI runs `lingui compile --strict`, which fails on any missing translation, and three checks: `lingui check sync` that the catalogs are what extract would write, `lingui check missing --mode catalog --verbose` that nothing is untranslated, and `bun run i18n:check` that no translation lost a placeholder, a `<0>` tag or a plural category its language selects. The `/translate` skill writes and reviews the translations for every shipped language, with a `translator` and a `translation-reviewer` agent per locale, and runs the catalog checks; run it before committing a string change. A contributor who adds a string without Claude Code gets a red CI run; the maintainer runs `/translate` on that pull request's branch before merging and pushes the translations as a commit. `no-unlocalized-strings` covers everything under `packages/app`, `packages/renderer`, `packages/preload-renderer` and `packages/preload-workspace-app`, except tests and the files `oxlint.config.ts` excludes as data, plus the files in its `LOCALIZED_FILES`: the Gmail preload's two that hold copy and the wrapped few in `@meru/shared`. The repository enables Lingui's `lingui` plugin for Claude Code; its build setup is settled as `@lingui/native-tools` through `scripts/lib/lingui-macro.ts` for main, the preloads and the extension scripts and `@lingui/vite-plugin` for the renderer, so a skill's Babel or SWC-plugin route is the fallback, never a fix.
- Behavior specific to a platform other than the one the session runs on, such as macOS accelerators, menus or signing from Linux, cannot be verified. Do what can be done and say so under a `## Not verified` heading.
