# CLAUDE.md

Meru is an Electron desktop client for Gmail and Google Workspace. This branch is Meru 4, built slice by slice through the `v4-build` skill (`.claude/skills/v4-build`). The plan, architecture and decisions are in `$PROJECT_DOCS_DIR/zoidsh/meru/v4`; read `05-architecture.md` and `06-process.md` there before changing structure, and record a decision in the doc it belongs to.

## Commands

`mise.toml` pins Node and pnpm, so setup is `mise install`, then `pnpm install --frozen-lockfile`. After changing a version in `mise.toml`, run `mise lock`. Lefthook formats and lint-fixes staged files at every commit.

| Task | Command |
| --- | --- |
| Run the app with rebuild-on-change | `pnpm dev`, flags below |
| Build into `out/prod` | `pnpm build` |
| Run the built app | `pnpm start`, same flags as `dev` |
| Lint, format check and typecheck together | `pnpm check` |
| Lint / lint with fixes | `pnpm lint` / `pnpm lint:fix` |
| Format / check formatting | `pnpm fmt` / `pnpm fmt:check` |
| Typecheck every package | `pnpm types` |
| Unit tests | `pnpm test` |
| One test file | `pnpm test packages/core/src/window-bounds` |
| One test by name | `pnpm test -t "name"` |

Run `pnpm check` and `pnpm test` before committing.

## Packages

A pnpm workspace; every package is `packages/<name>`, named `@meru/<name>`, and exports its `.ts` source, which Node runs through pnpm's symlinks. Every dependency is a devDependency, since everything is bundled and nothing ships from `node_modules`.

- `core`: pure logic with no Electron, unit-tested. Window bounds that stay on a display.
- `platform`: thin adapters over Electron, each behind an exported interface so features can be tested against fakes.
- `main`: the entry and composition root. Builds the adapters, registers the `meru-app://` scheme, opens the shell window.
- `preload-shell`: the shell window's sandboxed preload, bundled to one CommonJS file.
- `shell`: the shell renderer, React and Tailwind, built by Vite.
- `ui`: design tokens (`theme.css`, light and dark) and the `cn` helper.

Import boundaries, enforced by `no-restricted-imports` in `oxlint.config.ts`: `core` and `contract` import nothing of `electron`, types included; only `platform` imports it by value, and every other package may `import type` from it.

TypeScript stays runnable by Node's type stripping: explicit `.ts` extensions on relative imports, `import type` for types, no enums, parameter properties or path aliases. Lint and format config is Ultracite's oxlint and oxfmt presets and nothing of our own beyond the import boundaries.

## Builds

`scripts/build.ts` bundles `main` (ESM, `main.mjs`) and `preload-shell` (`preload-shell.cjs`) with rolldown and builds `shell` with Vite into `out/prod/shell`, and writes the `package.json` Electron reads the name and version from. A dev run builds into `out/dev`; the two never share a folder. `MERU_BUILD` is replaced at bundle time, so a production bundle has no path that loads from a dev server.

The built shell is served from `meru-app://shell/` with a strict Content-Security-Policy, never from `file://`. In development the shell loads from the Vite dev server, and the policy allows exactly that origin, its hot-reload socket and a per-run nonce Vite stamps on what it injects.

## Dev and start runs

- `pnpm dev` starts Vite on `PORT`, or a free port when it is unset, rebuilds `main` and `preload-shell` on change and restarts Electron. Stopping it with SIGINT or SIGTERM stops Electron and Vite; quitting the app stops the script.
- `--profile <name>` uses `.meru/<name>` in the repository as the user data directory. Without it, a linked worktree uses a profile named after its branch and the main checkout uses `default`. An unpackaged run never touches the user data directory of an installed Meru: the app refuses to start without `--user-data-dir`, which the scripts always pass.
- `--debug-port <n>` opens Chromium's remote debugging port; `0` lets Chromium pick and the script prints the port.
- `--background`, or `MERU_BACKGROUND=1` (which `.claude/settings.json` sets for Claude Code sessions), opens the window with `showInactive()` so it never takes the foreground or focus. On this shared Mac drive it over CDP, never by raising it.
- Any other flag passes through to Electron, such as `--disable-gpu`.
- Electron downloads its binary on first use, so the first run after a fresh install takes longer.
