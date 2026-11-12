# CLAUDE.md

Meru is an Electron client for Gmail and Google apps. The design, principles, glossary and decisions live outside this repository, in `$PROJECT_DOCS_DIR/zoidsh/meru/next` (`~/projects/docs/zoidsh/meru/next` on the maintainer's Mac); read `principles.md` and `architecture/design.md` before changing structure, and use the glossary's words.

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

> `core` imports nothing of ours and nothing of Electron's. Features import `core` and each other's types. `platform` is the only layer with a value import from `electron`.

> No module constructs a singleton at import. `index.ts` in main and the page entry in the renderer build the object graph.

> Adding a feature is additive: its diff touches its own directory, one line in `index.ts`, the glossary and the changelog.

`oxlint.config.ts` enforces the layers under `packages/app` with `no-restricted-imports` per directory, plus `import/no-cycle`. A preload value-imports `electron` only in its `bridge.ts`. The renderer and preloads never import `main`.

## Tests

> No test replaces one of our own modules. Doubles exist only at ports, one hand-written fake per port in `packages/app/test/fakes/`, an object literal that `satisfies` it or a small class that `implements` it, never a cast.

No `vi.mock` anywhere. Unit tests sit beside their file as `*.test.ts`; Vitest runs `core`, `shared`, `main` and `scripts` in Node and `preload` and `renderer` under happy-dom. `scripts/check-layers.test.ts` imports every `core/` and `main/features/` module with nothing faked. End-to-end tests are `tests/*.e2e.ts`.

## Comments

A comment says only what the code cannot: an outside constraint, such as Electron, Chromium, Gmail, a platform or a tool, or why the obvious approach was rejected. Never what the code does, and never a reference to a principle.

## Stage

`main/features/stage/` owns one `Stage` per window: the window's group and its layout, the view of each pane, and overlays such as the drag overlay. `Stage.reconcile()` is the only code that calls `addChildView` or `removeChildView`; it stacks panes in layout order, overlays above them and a fullscreen pane on top, and reorders by removing and inserting because Electron moves an attached view to the top whatever index it is given. Geometry comes from the pure `core/engines/layout.ts`. Cmd/Ctrl+D splits the focused pane vertically, Cmd/Ctrl+Shift+D horizontally, and Cmd/Ctrl+W closes it, from the View menu in `main/shell/menu.ts`. `MERU_STYLE=classic` draws panes edge to edge with 1px seams instead of the default `modern` inset, rounded panes; `MERU_E2E=1` loads `about:blank` in panes and answers the end-to-end suite's `e2e.snapshot` channel.

## IPC

A domain's channels are declared once in `shared/channels/<domain>.ts` with `defineChannels` and zod schemas, and a surface in `shared/channels/surfaces.ts` lists the domains a kind of page may use. Callers pass the channel objects, never names: the renderer's `client.send(stage.split, payload)`, a feature's `registrar.register(stage, { split: handler, … })`, `registrar.push(contentsId, stagePushes.changed, snapshot)`. A renamed channel, a changed schema, a missing handler or a channel of another surface fails `tsc --build`; at runtime the preload's allowlist and the dispatcher in `main/shell/ipc.ts` refuse anything outside the sender's surface and parse every payload before a handler sees it.

## Worktrees and profiles

`pnpm dev` in a linked worktree uses its own user data directory, `.meru/<branch>`, so several worktrees run at once; the main checkout keeps Electron's default. `--profile <name>` picks `.meru/<name>`. `--background`, or `MERU_BACKGROUND=1` (set for Claude Code sessions in `.claude/settings.json`), opens the window behind whatever is in front; the end-to-end suite also sets `MERU_TEST_BACKGROUND=1`, which keeps the app from ever activating on macOS.
