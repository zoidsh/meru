# CLAUDE.md

Meru is an Electron desktop client for Gmail and Google Workspace. This branch is Meru 4, built slice by slice through the `v4-build` skill (`.claude/skills/v4-build`). The plan, architecture and decisions are in `$PROJECT_DOCS_DIR/zoidsh/meru/v4`; read `05-architecture.md` and `06-process.md` there before changing structure, and record a decision in the doc it belongs to.

## Commands

`mise.toml` pins Node and pnpm, so setup is `mise install`, then `pnpm install --frozen-lockfile`. After changing a version in `mise.toml`, run `mise lock`. Lefthook formats and lint-fixes staged files at every commit. `pnpm install` installs the hook through lefthook's own postinstall, which skips CI.

| Task | Command |
| --- | --- |
| Run the app with rebuild-on-change | `pnpm dev`, flags below |
| Build into `out/prod` | `pnpm build` |
| Run the built app | `pnpm start`, same flags as `dev` |
| Lint, format check and typecheck together | `pnpm check` |
| Lint / lint with fixes | `pnpm lint` / `pnpm lint:fix` |
| Format / check formatting | `pnpm fmt` / `pnpm fmt:check` |
| Typecheck everything | `pnpm types` |
| Unit tests | `pnpm test` |
| One test file | `pnpm test src/core/window-bounds` |
| One test by name | `pnpm test -t "name"` |
| Pack the unpacked app into `dist/release` | `pnpm package` |
| Pack this platform's installers | `pnpm package:installers` |
| End-to-end suite (packs first) | `pnpm test:e2e`; on Linux `xvfb-run -a pnpm test:e2e` |

Run `pnpm check` and `pnpm test` before committing, and `pnpm test:e2e` when a change shows in a window. oxlint picks its `agent` output under Claude Code by itself.

## Layout

One package. Each area is a folder under `src`, with its tests beside the code:

- `core`: pure logic with no Electron, unit-tested.
- `platform`: thin adapters over Electron, each behind an exported interface so features can be tested against fakes.
- `main`: the entry and composition root. Builds the adapters, registers the `meru-app://` scheme, opens the shell window.
- `preload/shell`: the shell window's sandboxed preload, bundled to one CommonJS file.
- `shell`: the shell renderer, React and Tailwind, built by Vite (`vite.config.ts`).
- `i18n`: the languages, their catalogs in `locales`, and activation; imported by main and the renderers, so nothing of Electron.
- `ui`: shadcn components on Base UI, and `styles.css`, the Tailwind entry and theme every renderer imports.

An import across areas uses the `package.json` subpath alias, `#core/app-url.ts`; one within an area is relative. Both keep the `.ts` extension for Node's type stripping, which also rules out enums and parameter properties. `tsconfig.json` is the main side (Node, no DOM), `tsconfig.web.json` the renderers (DOM, no Node), and `src/preload` and `e2e` have their own with both; `core` and `i18n` are checked under the first two.

`oxlint.config.ts` holds the boundaries: `core` imports no other area and nothing of `electron`; only `platform` and `preload` import `electron` by value; no relative path into another area. Ultracite's preset already refuses `require`.

A general utility (delay, debounce, clamp, retry, a timeout, a mutex, deep equality and the like) comes from `es-toolkit`; write one here only when es-toolkit has none that fits.

Components in `src/ui` come only from `pnpm exec shadcn add <name>`, never written or patched by hand where the CLI has one, and stay as it writes them: oxfmt skips them and oxlint drops the rules their style breaks. In `src/ui/styles.css` the `dark` variant and the media query around the dark tokens are ours, so a regenerated theme must keep them.

## Strings

Every string a person reads is wrapped for Lingui: `t` from `@lingui/core/macro` in main, `<Trans>` or `useLingui()`'s `t` from `@lingui/react/macro` in a renderer. A short or ambiguous one, or one with a placeholder, takes a translator comment through `t({ message, comment })` or `<Trans comment="…">`. Log lines, thrown errors and the product name stay unwrapped. Call `t` where the string is shown, never at module load, so a language switched while running reaches it. `pnpm i18n:extract` rewrites `src/i18n/locales/en.po`, which is committed and which `pnpm check` compares with the source; the bundlers and Vitest load `.po` files directly, so there is nothing to compile. Main resolves the language once at startup and names it to a renderer in its URL's `lang` parameter. Lint catches a bare JSX text child and a literal `aria-label`, `title`, `alt` or `placeholder` in a renderer; other attributes, strings main passes to a dialog or a menu, and a `t` at module load are for review to catch.

## Builds

`scripts/build.ts` bundles `main` (ESM, `main.mjs`) and `preload/shell` (`preload-shell.cjs`) with rolldown and builds `shell` with Vite into `out/prod/shell`, and writes the `package.json` Electron reads the name and version from. A dev run builds into `out/dev`; the two never share a folder. `MERU_BUILD_MODE` is replaced by a string literal, so the bundler folds `MERU_BUILD_MODE === "dev"` and drops the development branch and all it imports from a production bundle. `scripts/build.ts` then fails if any marker in `scripts/lib/forbidden-markers.ts` appears in `out/prod`; add to that list whatever else must never ship.

The built shell is served from `meru-app://shell/` with a strict Content-Security-Policy, never from `file://`. In development the shell loads from the Vite dev server, and the policy allows exactly that origin, its hot-reload socket and a per-run nonce Vite stamps on what it injects.

`scripts/package.ts` builds, then packs with electron-builder from `electron-builder.config.ts`, which packs only the built app, into an asar, and flips the Electron fuses, into `dist/release`. It removes the variant's folder in `dist` first, so no app from another version sits beside the new one. Every build is unsigned for now. `--e2e` makes the end-to-end variant: built into `out/e2e` with `MERU_E2E_BUILD` true, which compiles in `MERU_TEST_BACKGROUND`, and packed into `dist/e2e` with the inspector fuse on for Playwright. It is never packed into installers, and a release build fails if `MERU_TEST_BACKGROUND` appears in it.

`appIdentity` in `src/core/app-identity.ts` names every build. The `out/prod` build, which `pnpm build` and `pnpm package` make and `pnpm start` runs, is `Meru`, `sh.zoid.meru`, for a release or beta version and `Meru Dev`, `sh.zoid.meru.dev`, for every `-dev` version; dev and e2e builds are always `Meru Dev`. `Meru Dev` claims no URL scheme. The name goes into the manifest Electron reads, so Electron's default user data folder for a `Meru Dev` build is never an installed Meru's, and the window title follows it. `pnpm start` passes its own `.meru/<profile>` directory whatever the build is named.

## Dev and start runs

- `pnpm dev` starts Vite on `PORT`, or a free port when it is unset, rebuilds `main` and the preload on change and restarts Electron, one restart at a time. SIGINT, SIGTERM or SIGHUP at any moment, repeated or not, stops Electron (killing it after 5 seconds if it has not quit) and Vite. Quitting the app ends the script; Electron dying of a signal the script did not send ends it with a failure.
- `--profile <name>` uses `.meru/<name>` in the repository as the user data directory; the name is one plain directory name. Without it, a linked worktree uses a profile named after its branch and the main checkout uses `default`.
- `--debug-port <n>` opens Chromium's remote debugging port; with `0` Chromium picks one and prints it.
- `--background`, or `MERU_BACKGROUND=1` (which `.claude/settings.json` sets for Claude Code sessions), opens the window with `showInactive()` so it never takes the foreground or focus. On this shared Mac drive it over CDP, never by raising it.
- Any other flag passes through to Electron, such as `--disable-gpu`.
- Electron downloads its binary on first use, so the first run after a fresh install takes longer.

## End-to-end tests

- `pnpm test:e2e` packs the e2e variant, then runs Playwright on it; extra arguments go to Playwright, such as a file name or `-g "name"`. `MERU_SKIP_BUILD=1` reuses `dist/e2e`. SIGINT, SIGTERM and SIGHUP sent to the script reach Playwright, which ends the apps. Run Electron with the Bash sandbox off, or it hangs without a window.
- A test is `e2e/<area>.e2e.ts`, never `.test.ts` or `.spec.ts`, and imports `test` and `expect` from `e2e/lib/app.ts`. Its fixtures launch the app per test on a fresh temporary user data directory: `app` is the Electron application, `shell` the loaded shell window, `userDataDir` its directory, and `spawnApp` starts a second instance on it. Teardown kills every process whose command line names the directory, which Chromium passes to every helper, and removes it, however the test ended; on Windows it kills the tree under each launched pid instead.
- Controls are found by role and name: `getByRole` with a name, or `getByLabel` or `getByText`. Lint in `e2e/` bans `locator`, `frameLocator`, `getByTestId`, `$`, `$$`, `$eval`, `$$eval` and `waitForSelector`; any other way of reaching an element by selector is left to review.
- Every launch sets `MERU_TEST_BACKGROUND=1`, under which the app on macOS can never be activated, whatever a test shows or focuses; `e2e/background.e2e.ts` proves it. Drive it through Playwright, never by raising it.
- A failed test keeps its trace and a screenshot of each window under `test-results/`; `pnpm exec playwright show-trace <trace.zip>` opens one.

## CI

`.github/workflows/ci.yml` runs on every push to `v4`: `check` (lint with GitHub annotations, format check, types, catalog sync), `test`, the end-to-end suite on Linux under `xvfb-run` and on Windows, and `pnpm package:installers` on macOS, Windows and Linux, unsigned and not kept. A newer push cancels the run in progress. `gh workflow run ci.yml --ref v4` runs it on demand. There is no hosted macOS end-to-end job: run `pnpm test:e2e` on the Mac mini before pushing. A failed end-to-end job uploads `test-results/`, traces included, as the run's `e2e-linux` or `e2e-windows` artifact; `gh run download <run id> -n e2e-linux` fetches it.
