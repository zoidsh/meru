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
| Memory, processes and idle CPU against a minimal Electron app (Mac mini only, needs `pnpm build` and signed-in `.meru/measure-*` profiles) | `pnpm measure`, `pnpm measure --help` |

Run `pnpm check` and `pnpm test` before committing, and `pnpm test:e2e` when a change shows in a window.

## Layout

One package; each area is a folder under `src` with its tests beside the code: `core` (pure logic, no Electron), `platform` (thin adapters over Electron, each behind an exported interface so features test against fakes), `main` (entry and composition root), `preload/shell`, `shell` (the React and Tailwind renderer), `i18n` (languages and catalogs, nothing of Electron) and `ui` (shadcn components and `styles.css`). An import across areas uses the subpath alias, `#core/app-url.ts`; one within an area is relative; both keep the `.ts` extension. `oxlint.config.ts` enforces the boundaries.

A general utility (delay, debounce, clamp, retry, a timeout, a mutex, deep equality and the like) comes from `es-toolkit`; write one only when es-toolkit has none that fits.

Components in `src/ui` come only from `pnpm exec shadcn add <name>`, never written or patched by hand, and stay as the CLI writes them. In `src/ui/styles.css` the `dark` variant, the `@source` naming `src/ui` and the media query around the dark tokens are ours, so a regenerated theme must keep them.

## Strings

Every string a person reads is wrapped for Lingui: `t` from `@lingui/core/macro` in main, `<Trans>` or `useLingui()`'s `t` from `@lingui/react/macro` in a renderer. A short or ambiguous one, or one with a placeholder, takes a translator comment through `t({ message, comment })` or `<Trans comment="…">`. Log lines, thrown errors and the product name stay unwrapped. Call `t` where the string is shown, never at module load. `pnpm i18n:extract` rewrites `src/i18n/locales/en.po`, which is committed and which `pnpm check` compares with the source. Main resolves the language once at startup and names it to a renderer in its URL's `lang` parameter. Lint catches a bare JSX text child and a literal `aria-label`, `title`, `alt` or `placeholder`; a string main passes to a dialog or a menu, and a `t` at module load, are for review.

## Builds

Compare `MERU_BUILD_MODE` and `MERU_E2E_BUILD` directly, never through a variable, so the bundler drops a development or test-only branch from a production bundle. `pnpm build` fails if a marker in `scripts/lib/forbidden-markers.ts` appears in `out/prod`; add to that list whatever else must never ship.

`appIdentity` in `src/core/app-identity.ts` names every build: `Meru` (`sh.zoid.meru`) only for a `prod` build of a release or beta version, and `Meru Dev` (`sh.zoid.meru.dev`) for every `-dev` version and every dev or e2e build. `Meru Dev` claims no URL scheme and never shares an installed Meru's user data. The e2e variant (`pnpm package --e2e`, into `dist/e2e`) has the inspector fuse on and compiles in `MERU_TEST_BACKGROUND`; it is never packed into installers.

## Dev and start runs

- `--profile <name>` uses `.meru/<name>` as the user data directory; without it a linked worktree uses a profile named after its branch and the main checkout `default`.
- `--debug-port <n>` opens Chromium's remote debugging port; `0` lets Chromium pick and print one.
- `--background`, or `MERU_BACKGROUND=1` (which `.claude/settings.json` sets), opens the window without taking the foreground or focus. On this shared Mac drive it over CDP, never by raising it.
- Any other flag passes through to Electron. `pnpm dev` serves the shell from Vite on `PORT`, or a free port.

## End-to-end tests

- Run Electron with the Bash sandbox off, or it hangs without a window. `MERU_SKIP_BUILD=1` reuses `dist/e2e`; extra arguments go to Playwright.
- A test is `e2e/<area>.e2e.ts`, never `.test.ts` or `.spec.ts`, and imports `test` and `expect` from `e2e/lib/app.ts`, whose fixtures give each test its own app and user data directory.
- Controls are found by role and name: `getByRole` with a name, `getByLabel` or `getByText`. Lint bans the selector APIs; any other way of reaching an element by selector is left to review.
- Every launch sets `MERU_TEST_BACKGROUND=1`, under which the app on macOS can never be activated; drive it through Playwright, never by raising it.
- A failed test keeps its trace and window screenshots under `test-results/`; `pnpm exec playwright show-trace <trace.zip>` opens one.

## CI

`.github/workflows/ci.yml` runs on every push to `v4`, and `gh workflow run ci.yml --ref v4` on demand. There is no hosted macOS end-to-end job: run `pnpm test:e2e` on the Mac mini before pushing. A failed end-to-end job uploads `test-results/` as the run's `e2e-linux` or `e2e-windows` artifact; `gh run download <run id> -n e2e-linux` fetches it.
