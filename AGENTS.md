# AGENTS.md

Meru 4, the rewrite of the Electron client for Gmail and Google Apps. The design, principles, glossary and decisions live outside this repository, in `$PROJECT_DOCS_DIR/zoidsh/meru/next` (`~/projects/docs/zoidsh/meru/next` on the maintainer's Mac); read `principles.md` and `architecture/design.md` before changing structure, and use the glossary's words.

## Commands

`mise install`, then `pnpm install --frozen-lockfile`. mise puts `node_modules/.bin` on PATH, so `vp` and `tsc` run bare.

| Task | Command |
| --- | --- |
| Run the app, rebuilding on change | `pnpm dev`, with `--profile <name>`, `--background`, or any Electron argument |
| Lint, format check, format | `vp lint`, `vp fmt --check`, `vp fmt` |
| Typecheck | `tsc --build` |
| Unit tests | `vp test run`, one file `vp test run <path>` |
| Everything before a push | `pnpm check` (format, lint, types, tests) |
| Build into `dist/` | `pnpm build` |
| End-to-end, against `dist/` | `pnpm test:e2e`; on Linux `xvfb-run -a pnpm test:e2e` |

## Layers

> `core` imports nothing of ours and nothing of Electron's. Features import `core` and each other's types. `platform` is the only layer with a value import from `electron`. (Principle 1)

> No module constructs a singleton at import. `index.ts` in main and the page entry in the renderer build the object graph. (Principle 2)

> Adding a feature is additive: its diff touches its own directory, one line in `index.ts`, the glossary and the changelog. (Principle 11)

`oxlint.config.ts` enforces the layers under `packages/app` with `no-restricted-imports` per directory, plus `import/no-cycle`. A preload value-imports `electron` only in its `bridge.ts`. The renderer and preloads never import `main`.

## Tests

> No test replaces one of our own modules. Doubles exist only at ports, one hand-written fake per port in `packages/app/test/fakes/`, an object literal that `satisfies` it, never a cast. (Principle 6)

No `vi.mock` anywhere. Unit tests sit beside their file as `*.test.ts`; Vitest runs `core`, `shared`, `main` and `scripts` in Node and `preload` and `renderer` under happy-dom. `scripts/check-layers.test.ts` imports every `core/` and `main/features/` module with nothing faked. End-to-end tests are `tests/*.e2e.ts`.

## Worktrees and profiles

`pnpm dev` in a linked worktree uses its own user data directory, `.meru/<branch>`, so several worktrees run at once; the main checkout keeps Electron's default. `--profile <name>` picks `.meru/<name>`. `--background`, or `MERU_BACKGROUND=1` (set for Claude Code sessions in `.claude/settings.json`), opens the window behind whatever is in front; the end-to-end suite also sets `MERU_TEST_BACKGROUND=1`, which keeps the app from ever activating on macOS.
