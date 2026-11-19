# CLAUDE.md

Meru is an Electron desktop client for Gmail and Google Workspace. This branch is Meru 4, built slice by slice through the `v4-build` skill (`.claude/skills/v4-build`). The plan, architecture and decisions are in `$PROJECT_DOCS_DIR/zoidsh/meru/v4`; read `05-architecture.md` and `06-process.md` there before changing structure, and record a decision in the doc it belongs to.

## Commands

Setup is `mise install`, then `pnpm install --frozen-lockfile`; after changing a version in `mise.toml`, run `mise lock`. `package.json` has the scripts; the ones to know:

| Task | Command |
| --- | --- |
| Run with rebuild-on-change | `pnpm dev`, flags below |
| Build into `out/prod`, then run it | `pnpm build`, `pnpm start` (same flags) |
| Lint, format check, types, catalog sync | `pnpm check` |
| Unit tests, one file, one name | `pnpm test`, `pnpm test src/core/window-bounds`, `pnpm test -t "name"` |
| Pack the unpacked app / the installers | `pnpm package` / `pnpm package:installers` |
| End-to-end suite (packs first) | `pnpm test:e2e`; on Linux `xvfb-run -a pnpm test:e2e` |
| Memory against a bare Electron app (Mac mini, after `pnpm build`) | `pnpm measure --help` |

Run `pnpm check` and `pnpm test` before committing, and `pnpm test:e2e` when a change shows in a window.

Tests use no mocks unless nothing else would do: no `vi.mock`, and no `vi.fn` or `vi.spyOn` standing in for a module of ours. Pure logic is tested directly, and a feature against a hand-written fake of the `platform` interface it takes; code that seems to need a mock takes that interface as an argument instead. Fake timers are fine. A mock that is truly needed carries a comment saying why.

## Layout

One package; each area is a folder under `src` with its tests beside the code: `core` (pure logic, no Electron), `contract` (the IPC calls and state each renderer may use, importing only `core`), `platform` (thin adapters over Electron, each behind an exported interface so features test against fakes), `main` (entry and composition root, `index.ts`, with the wiring of each feature in `main/wiring`, one function per module that a new feature adds rather than editing the root), `preload` (`shell` for the shell, `gmail` for Gmail's page, which `pnpm build` holds to a byte budget and lint keeps free of `zod`), `shell` (the React and Tailwind renderer), `i18n` (languages and catalogs, nothing of Electron) and `ui` (shadcn components and `styles.css`). An import across areas uses the subpath alias, `#core/app-url.ts`; one within an area is relative; both keep the `.ts` extension. `oxlint.config.ts` enforces the boundaries.

Main's two stores, `state.json` (profiles and tabs) and `settings.json`, load through `src/main/stores.ts`. A file that does not decode is set aside, never deleted; what a build cannot read is written back as found; a newer version stops startup untouched. A store's version integer never changes, since an older one reads as unreadable; its shape only grows, read leniently. Anything added to either keeps those rules.

A general utility (delay, debounce, clamp, retry, a timeout, a mutex, deep equality and the like) comes from `es-toolkit`; write one only when es-toolkit has none that fits.

Components in `src/ui` come only from `pnpm exec shadcn add <name>`, never written or patched by hand, and stay as the CLI writes them. Load the `shadcn` skill (`.claude/skills/shadcn`, from `pnpm dlx skills add shadcn/ui`, pinned in `skills-lock.json`) before building or changing UI, and look for a shadcn component and its composition before writing markup of our own; where the skill and this file disagree, this file wins: the CLI runs as `pnpm exec shadcn`, never `@latest`, and runs `init` or `apply` only at Tim's word. The project is on preset `b27GcrRo` (style `base-rhea`). In `src/ui/styles.css` the `dark` variant, the `@source` naming `src/ui`, the `--shell` token, the profile tint (`data-tint`, `data-tinted` and the `--tint-*` tokens, with `--color-shell` reading `--tint-shell`), the `base-ui-disable-scrollbar` rule and the media query around the dark tokens are ours, so a regenerated theme must keep them.

## Strings

Every string a person reads is wrapped for Lingui: `t` from `@lingui/core/macro` in main, `<Trans>` or `useLingui()`'s `t` from `@lingui/react/macro` in a renderer. A short or ambiguous one, or one with a placeholder, takes a translator comment through `t({ message, comment })` or `<Trans comment="…">`. Log lines, thrown errors and the product name stay unwrapped. Call `t` where the string is shown, never at module load. `pnpm i18n:extract` rewrites the committed `src/i18n/locales/en.po`, which `pnpm check` compares with the source. Lint catches a bare JSX text child and a literal `aria-label`, `title`, `alt` or `placeholder`; strings main passes to a dialog or a menu are for review.

## Builds

Compare `MERU_BUILD_MODE` and `MERU_E2E_BUILD` directly, never through a variable, so the bundler drops a development or test-only branch from a production bundle. `pnpm build` fails if a marker in `scripts/lib/forbidden-markers.ts` appears in `out/prod`; add to that list whatever else must never ship.

`appIdentity` in `src/core/app-identity.ts` names every build: `Meru` (`sh.zoid.meru`) only for a `prod` build of a release or beta version, else `Meru Dev` (`sh.zoid.meru.dev`), which claims no URL scheme and never shares an installed Meru's user data. The e2e variant (`pnpm package --e2e`, into `dist/e2e`) has the inspector fuse on and is never packed into installers.

## Dev and start runs

- `--profile <name>` uses `.meru/<name>` as the user data directory; without it a linked worktree uses a profile named after its branch and the main checkout `default`.
- `--debug-port <n>` opens Chromium's remote debugging port; `0` lets Chromium pick and print one.
- `--background`, or `MERU_BACKGROUND=1` (which `.claude/settings.json` sets), opens the window without taking the foreground or focus. On this shared Mac drive it over CDP, never by raising it.
- A page that prints or shows an `alert`, `confirm` or `prompt` (Gmail's Print all, a discard in its pop-out) brings the app forward even under the background flag; when driving Gmail live, replace `window.print`, `alert`, `confirm` and `prompt` in each page through `executeJavaScript` before any click.
- Any other flag passes through to Electron. `pnpm dev` serves the shell from Vite on `PORT`, or a free port.
- On the Mac mini the `v4` worktree's `.meru/signed-in` holds the Google test account: `--profile signed-in` there, one app at a time, never with `--debug-port`, which Google refuses; a second copy of the session gets signed out. `--inspect=0` opens main's inspector alone, enough to watch a view.

## End-to-end tests

- Run Electron with the Bash sandbox off, or it hangs without a window. `MERU_SKIP_BUILD=1` reuses `dist/e2e`; extra arguments go to Playwright.
- A test is `e2e/<area>.e2e.ts`, never `.test.ts` or `.spec.ts`, and imports `test` and `expect` from `e2e/lib/app.ts`, whose fixtures give each test its own app and user data directory.
- Controls are found by role and name (`getByRole` with a name, `getByLabel`, `getByText`); lint bans the selector APIs.
- Every launch sets `MERU_TEST_BACKGROUND=1`, under which the app on macOS can never be activated; drive it through Playwright, never by raising it. On Windows and Linux each launch takes the desktop's focus, so a test that needs its window to keep it belongs in a file `e2e/playwright.config.ts` runs alone.
- Playwright makes every page claim focus until `Emulation.setFocusEmulationEnabled` is off, as in `overlay.e2e.ts`, and emulates the light theme.
- `MERU_E2E_SHOTS=1` also runs the screenshot tests (in `e2e/screens.e2e.ts` and `e2e/inbox.e2e.ts`), which write `test-results/shots/<surface>[-<design>][-<theme>].png` for a person to look at and assert nothing of the picture. `shootWindow` in `e2e/lib/shots.ts` pictures the whole window by drawing each shown view over the shell's capture, since a window's `capturePage()` holds the shell alone; it never captures the display.
- A failed test keeps under `test-results/`, for each app it launched, a picture of the whole window drawn by `shootWindow` and the accessibility trees of the shell and of the overlay's document (toast, menus, cards), which Playwright's own `error-context.md` lacks; a test on the `app` fixture also keeps its trace, which `pnpm exec playwright show-trace <trace.zip>` opens.

## CI

`.github/workflows/ci.yml` runs on every push to `v4`, and `gh workflow run ci.yml --ref v4` on demand. No hosted job runs the end-to-end suite on macOS: run it on the Mac mini before pushing. An end-to-end job uploads `test-results/` as its `e2e-linux` or `e2e-windows` artifact, which `gh run download <run id> -n e2e-linux` fetches.
