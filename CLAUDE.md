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
| Measure CPU and memory, against `dist/`, macOS only | `pnpm measure`, `pnpm test:budget` |

## Layers

> `core` imports nothing of ours and nothing of Electron's. Features import `core` and each other's types. `platform` is the only layer with a value import from `electron`.

> No module constructs a singleton at import. `index.ts` in main and the page entry in the renderer build the object graph.

> Adding a feature is additive: its diff touches its own directory, one line in `index.ts`, the glossary and the changelog.

`oxlint.config.ts` enforces the layers under `packages/app` with `no-restricted-imports` per directory, plus `import/no-cycle`. A preload value-imports `electron` only in its `bridge.ts`. The renderer and preloads never import `main`, with one exception: a feature's `settings.ts` and `commands.ts` are its half of the contract every page reads, so they compile with `shared`, the registries in `shared/*/registry.ts` import them, and lint holds them to what `shared` may import.

## Tests

> No test replaces one of our own modules. Doubles exist only at ports, one hand-written fake per port in `packages/app/test/fakes/`, an object literal that `satisfies` it or a small class that `implements` it, never a cast.

No `vi.mock` anywhere. Unit tests sit beside their file as `*.test.ts`; Vitest runs `core`, `shared`, `main` and `scripts` in Node and `preload` and `renderer` under happy-dom. Core's tests compile in `core/tsconfig.test.json`, which may take the fakes, since the fakes import core. `scripts/check-layers.test.ts` imports every `core/` and `main/features/` module with nothing faked. End-to-end tests are `tests/*.e2e.ts`.

## Comments

A comment says only what the code cannot: an outside constraint, such as Electron, Chromium, Gmail, a platform or a tool, or why the obvious approach was rejected. Never what the code does, and never a reference to a principle.

## Stage

`main/features/stage/` owns one `Stage` per window: the window's group and its layout, the view of each pane, and overlays such as the drag overlay. `Stage.reconcile()` is the only code that calls `addChildView` or `removeChildView`; it stacks panes in layout order, overlays above them and a fullscreen pane on top, and reorders by removing and inserting because Electron moves an attached view to the top whatever index it is given. Geometry comes from the pure `core/engines/layout.ts`. The stage declares its commands in `commands.ts`, each in the View menu: `stage.splitVertical` (Cmd/Ctrl+Alt+N), `stage.splitHorizontal` (Cmd/Ctrl+Alt+Shift+N), `stage.closeTab` (Cmd/Ctrl+Shift+W), which closes the focused pane's tab and so the pane, and refuses the last one, and `stage.focusNext` and `stage.focusPrevious` (Cmd/Ctrl+Alt+. and ,), which move focus through the panes in layout order. Cmd/Ctrl+W is kept for closing the window. The setting `appearance.style` picks `modern`, inset rounded panes, or `classic`, edge to edge with 1px seams, and `stage.zoom` the panes' zoom per profile; a change to either lays out or zooms the panes again. `MERU_E2E=1` loads `about:blank` in panes and answers the end-to-end suite's `e2e.snapshot` channel from `main/shell/e2e.ts`.

## Settings

A feature declares its settings in its own `settings.ts` with `defineSetting("feature.name", { schema, default, scope, tier, restart, page, label })`, and adds the list to `shared/settings/registry.ts`, the one place they are assembled; the key's form, the default against the schema and every reader's value type are checked by `tsc --build`. Most settings are `scope: "global"`. A setting is `scope: "profile"` only when its value is about that profile's page or mail, such as `stage.zoom`; only those may be overridden per profile, which the `Settings` type refuses at compile time and `parseSettings` drops at load. A value resolves as the profile's override, then the global value, then the default (`core/engines/settings.ts`).

`main/features/settings/` keeps them in `<userData>/settings.json`, `{ version, data: { global, profiles: { <id>: overrides } } }`, through the `SnapshotStore` in `core/snapshot.ts`, which parses per key so a bad value costs only itself, writes debounced and on quit, and keeps a corrupt file beside it as `settings.json.corrupt`. Main reads with `settings.get(key, profileId?)` and reacts through `settings.subscribe`; a page reads with `useSetting(key, profileId?)` from `renderer/features/settings/use-setting.ts`, seeded by `settings.snapshot` and kept by the `settings.changed` push. A run from the repository (`pnpm dev`, the end-to-end suite) also follows hand edits to the file; an installed app does not watch it.

## Commands

Every action a user can trigger is a command, declared by its feature in `commands.ts` with `defineCommands("feature", { name: { label, shortcut?: { default }, menu?: { section, order } } })`, which makes the id `feature.name`, and handled through the `CommandRegistrar` its constructor takes. `shared/commands/registry.ts` assembles every feature's commands; `main/shell/menu.ts` builds the menu from them and a page runs one with `client.invoke(commands.run, { id })`. A command's shortcut is its default unless `shortcuts.bindings` maps its id to another accelerator, or to `null` for none; `core/engines/shortcuts.ts` parses, normalises and resolves them and reports conflicts. The menu carries the resolved shortcuts, which is what makes one work while a pane has focus, and is rebuilt when the bindings change.

## IPC

A domain's channels are declared once in `shared/channels/<domain>.ts` with `defineChannels` and zod schemas, and a surface in `shared/channels/surfaces.ts` lists the domains a kind of page may use. Callers pass the channel objects, never names: the renderer's `client.send(stage.split, payload)`, a feature's `registrar.register(stage, { split: handler, … })`, `registrar.push(contentsId, stagePushes.changed, snapshot)`. A renamed channel, a changed schema, a missing handler or a channel of another surface fails `tsc --build`; at runtime the preload's allowlist and the dispatcher in `main/shell/ipc.ts` refuse anything outside the sender's surface and parse every payload before a handler sees it.

## Measure

`pnpm measure [--profile <name>] [--samples <n>] [--idle <seconds>] [--blank] [--floor[=view]]` launches the built app and reads every process, by kind (main, chrome page, pane, overlay, gpu, utility), at three points: 5s after launch, right after one split, and after a minute idle. It prints each kind's largest memory and mean CPU per point, and appends one JSON line, with the host, to `measurements/darwin.jsonl`, which is committed and keeps its newest 500 lines. The file records the maintainer's Mac mini only, so its lines stay comparable: a run appends only when its hostname matches the first line's or `MERU_MEASURE_HOST`, and otherwise says it did not record. `--floor` also measures `scripts/floor/`, a bare Electron app with one sandboxed window, and `--floor=view` the same with one view, and prints them beside Meru. Memory is private for main and the working set for the rest, which is all Electron reports on macOS. `pnpm test:budget` fails if any process uses more than 2% CPU at idle or main or the chrome page grows more than 10MB from launch to idle.

Both run by hand on macOS, not in CI, before pushing a change that could move the numbers; the run's line is committed with the change and its commit message says what moved.

## Entitlement

The entitlement is derived from a token the API signs, JWT-shaped with `alg: EdDSA` and a `kid`, and verified on the device. `core/entitlement/token.ts` parses it and declares the claims; `verify.ts` checks the key, the Ed25519 signature through `crypto.subtle`, the device id and the expiry with a skew allowance; `derive.ts` turns claims into the `Entitlement` record (`core/records/entitlement.ts`: `unknown`, `free`, `trial`, `licensed`, `disabled`, with `source` and `expiresAt`); `gate.ts`'s `canUse` is what a Pro action asks, with `unknown` gating as free. `main/features/entitlement/` keeps `entitlement.json`, `{ version, data: { deviceId, licenseKey, token: { value, licenseKey }, lastAnswer, rejected } }`: `open()` verifies the stored token with no network, `attach()` answers the `entitlement.snapshot` channel before the window shows, and `start()`, after it, asks the `EntitlementApi` port for a token whenever there is none, it has expired or it was issued for another license key, at once when online, on the network's return when not, at the token's expiry through the clock, after a failure at a growing interval, and when the machine wakes. A rejected license key is asked about again an hour later; meanwhile the device asks for its trial while the trial has not ended, and is free once it has or when it holds no trial token. It never shows anything; a change reaches the chrome page as the `entitlement.changed` push, which marks `data-entitlement` on the root, and features through `subscribe` and the `entitlement.changed` event.

The app POSTs `{ licenseKey, deviceId }` to `MERU_ENTITLEMENT_URL`, or the placeholder in `shared/entitlement/api.ts`, and takes `{ token }` from a 200 and `{ error: { reason } }` from a 4xx. To run against a local stand-in, `node tests/entitlement-stub.ts` serves the end-to-end suite's stub, which signs with the development key, answering a trial with no license key and Pro for `PRO-KEY`, and prints the `MERU_ENTITLEMENT_URL=…` to launch `pnpm dev` with. To put a token in place by hand, `node scripts/entitlement/sign.ts claims.json` prints one for claims such as `{ "sub": "<deviceId from entitlement.json>", "plan": "pro", "deviceLimit": 3, "ttl": 10800, "status": "active" }`.

`shared/entitlement/keys.ts` holds the Ed25519 public keys a token may be signed with, by `kid`, compiled into the bundle. The development key, `dev-2026-11`, is not a secret: its private half is `scripts/entitlement/dev-private.pem`, and only a run from the repository accepts it, never an installed app. A production key is added to `productionKeys` by a release, before the API signs with it; the app never fetches a key.

## Worktrees and profiles

`pnpm dev` in a linked worktree uses its own user data directory, `.meru/<branch>`, so several worktrees run at once; the main checkout keeps Electron's default. `--profile <name>` picks `.meru/<name>`. `--background`, or `MERU_BACKGROUND=1` (set for Claude Code sessions in `.claude/settings.json`), opens the window behind whatever is in front; the end-to-end suite also sets `MERU_TEST_BACKGROUND=1`, which keeps the app from ever activating on macOS.
