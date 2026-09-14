# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Meru is an Electron desktop client for Gmail and Google Workspace, sold with a Pro tier. The code is public here; plans and working docs are private and checked out at `~/docs/meru`. Read `~/docs/meru/architecture/overview.md` before touching `packages/app`, and check `~/docs/meru/decisions.md` before relitigating a design choice. Where this file and those docs overlap, the docs win.

## Commands

Setup is `bun install --frozen-lockfile`. Lefthook formats and lint-fixes staged files at every commit.

| Task                                    | Command                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| Run the app with rebuild-on-change      | `bun run dev`, flags below                                  |
| Format / check formatting               | `bun run fmt` / `bun run fmt:check`                         |
| Lint / lint with fixes                  | `bun run lint` / `bun run lint:fix`                         |
| Typecheck every package                 | `bun run types`                                             |
| Unit tests                              | `bun test`                                                  |
| One unit test file                      | `bun test packages/shared/tabs.test.ts`                     |
| One test by name                        | `bun test -t "name"`                                        |
| End-to-end suite (builds the app first) | `bun run test:e2e`; on Linux `xvfb-run -a bun run test:e2e` |
| Perf suite (memory, CPU, bundle size)   | `bun run test:perf`, same display caveat                    |
| Build for one platform                  | `bun run build:mac` / `build:linux` / `build:win`           |

`bun run dev` takes `--devtools` to open devtools, `--debug-port 9222` to expose CDP, and `--profile <name>` to use `.meru/<name>` as the user data directory, so a signed-in account survives between runs. Any other option goes to Electron as typed, such as `--disable-gpu`.

Checks by cost: `bun run lint && bun run types` in the edit loop; `fmt:check`, `lint`, `types` and `bun test` before a pull request, since each is a CI job; the end-to-end suite is what CI adds on top, on all three platforms.

End-to-end details: `MERU_SKIP_BUILD=1` reruns against the build already in `dist`, `MERU_EXECUTABLE` points at any built app, and extra arguments pass through to Playwright. The suite reads a license key from `.env.test.local`. Test files are `*.e2e.ts` and `*.perf.ts`, never `*.spec.ts`, because `bun test` would claim that name.

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

## Boundaries

- Add packages with `bun add -d`. Everything is bundled, and electron-builder would ship a runtime `dependencies` entry a second time. The one exception is a native module Electron loads at runtime.
- Style lands as a rule in `@timche/oxc-configs`, checked out at `~/oxc-configs` and extended by `oxlint.config.ts`, never as a sweep inside a feature pull request. New code matches its neighbors until a rule lands.
- Ask before bumping Electron or electron-builder. CI builds unsigned, so signing and installer packaging first run in the release itself.
- Ask before adding a config migration to the ladder in `packages/app/config.ts`. Every migration guards every key it reads and branches on a legacy key, never on a value equal to a default. An unguarded read bricked every fresh install of a 3.60 beta, and only a release build runs a new migration. Nothing runs the ladder against an empty store, so the guards are held by review alone.
- Ask before changing `tests/memory-budget.json` or `tests/bundle-budget.json`; a budget moves only when the issue asks for it.
- Ask before touching licensing, the trial, Pro gating or the settings behind them. Plan decisions span both repositories.
- Never bump the version, tag or cut a release. That is the `release` skill, run by Tim, and the updater ships whatever is tagged.
- Never put the license key from `.env.test.local` in a commit, comment or pull request.
- A writing-style pass leaves marketing and identity copy alone: taglines, product descriptions, the README header, the package `description`. Raise a line that breaks a rule as a question instead of editing it.

## Practices

- Durations come from `ms` in `@meru/shared/ms`, never the `ms` package.
- A user-visible change adds one line to the `[Unreleased]` section of `CHANGELOG.md`, under `Added`, `Changed` or `Fixed`, written for users in the style of the `release-notes` skill. The line lands in the same commit and pull request as the change, not in a follow-up. Refactors, tests, CI, docs and dependency bumps other than Electron get no line. The file holds only that section: the version commit empties it and the `release-notes` skill moves the lines onto the GitHub Release, so never add a versioned section.
- Before attaching a listener to a `webContents` or emitter, grep the file for that event on the same target and add the work to the existing handler. Listeners that attach and detach independently stay separate.
- Platform branches use `platform` from `@electron-toolkit/utils` in main and from `@/lib/utils` in the renderer. A cross-platform accelerator uses `CommandOrControl` and `Alt`; a bare `Command` or `Option` is honored on macOS only and fails silently elsewhere.
- Renderer: `packages/ui` components follow shadcn conventions and many are compound, so read the component file and use its sub-components instead of `<div>` wrappers. Merge conditional classes with `cn` from `@meru/ui/lib/utils`. Keyboard keys in copy render through `Kbd`. A config-backed settings field is `ConfigSwitchField` for a boolean key or `ConfigSelectField` for a string-union key; a fixed set of named choices is a string union, not a boolean.
- Interface text follows the `ui-writing` skill.
- Behavior specific to a platform other than the one the session runs on, such as macOS accelerators, menus or signing from Linux, cannot be verified. Do what can be done and say so under a `## Not verified` heading.
