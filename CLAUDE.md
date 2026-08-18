# Meru Claude Code guidelines

## Setup

```sh
bun install --frozen-lockfile
```

## Commands

```sh
bun run dev        # run the app in development
bun run types      # type check every package (CI runs `bun run types:ci`)
bun run lint       # oxlint
bun run fmt:check  # oxfmt check; `bun run fmt` writes
bun test           # tests across every package
```

- `bun run types`, `bun run lint`, and `bun run fmt:check` must pass before pushing.

## Docs

- `docs/` is a separately cloned private docs repo, gitignored here, and it might be absent on fresh checkouts. When it's present, read `docs/README.md` for what lives where.
- Check `docs/decisions.md` before reopening a settled design decision.
- Keep `docs/architecture/` current when changing the app's structure. Larger features start as a design doc in `docs/features/` before implementation.
- When renaming a main-process class or file, grep `docs/` for the old name and fix every reference — the docs repo has no other mechanism to catch renames.

## Dependencies

- Always install packages as dev dependencies with `bun add -d <package>`. Rolldown and Vite bundle everything at build time, and Electron builder re-bundles anything in `dependencies` into the shipped app, so normal deps would ship duplicated. The only exception is packages with native modules that Electron needs to load at runtime — those must go in `dependencies` so electron-builder can package them correctly.

## UI components

- Components in `packages/ui` follow shadcn conventions. Many are compound components with named sub-components — `Item` → `ItemContent`, `ItemActions`, `ItemTitle`, `ItemDescription`, for example. Always read the component file before use to find available sub-components and use them instead of plain `<div>` wrappers.
- Never repeat shared classes across the branches of a conditional `className`. Hoist them and merge with the `cn` helper (`@meru/ui/lib/utils`): `cn("absolute hidden", isWide ? "size-5" : "size-4")`.
- Consider the platform when showing platform-specific information such as modifier keys and OS names. Branch on the existing `platform` helper — `@/lib/utils` in the renderer, `@electron-toolkit/utils` in the main process — as in `platform.isMacOS ? "Cmd" : "Ctrl"`.
- Render keyboard keys in user-facing text with the `Kbd` component (`@meru/ui/components/kbd`), not as plain text: `Hold <Kbd>Shift</Kbd> to …`.
- Child `WebContentsView`s always paint above the main window's HTML, so renderer-drawn overlays such as dropdowns, tooltips, and dialogs get covered wherever a view sits. Keep overlays inside the regions the renderer owns, meaning the titlebar and the vertical tabs — vertical tabs menus open with `side="top"` at anchor width, for example. For overlays over view content, use a native `Menu.popup` or a dedicated `WebContentsView`. See `Popup` in `packages/app/lib/popup.ts`.

## Settings UI patterns

- Structure settings fields like this: `Field` > `FieldLabel` + `FieldDescription` + control component.
- Render config-backed fields with the existing wrapper components rather than hand-rolling `Field` + control: `ConfigSwitchField` for a boolean key, `ConfigSelectField` for a string-union key, both in `packages/renderer/components/`. Each enforces its key's type at runtime, so the value type dictates the component — a fixed set of named choices must be modeled as a string union with `ConfigSelectField`, not a boolean with a switch.
- In a `ConfigSelectField`, list the option matching the config default first in `items`.
- Read the config with `useConfig()` and persist changes with `useConfigMutation()`.
- Use `toast.error()` for validation errors — never throw or console.error for user-facing feedback.

## Config keys

- Follow the existing `"section.camelCase"` dot-notation pattern, as in `"notifications.times"`.
- When combining a global config check with more specific conditions such as per-account flags, counts, or local state, always check the global setting first so that it short-circuits the rest:

  ```ts
  // correct
  if (config.get("unifiedInbox.enabled") && accounts.length > 1) { ... }

  // wrong
  if (accounts.length > 1 && config.get("unifiedInbox.enabled")) { ... }
  ```

## Config change listeners

- Register a `config.onDidChange("some.key", ...)` listener once at the manager or collection level, as in `Accounts.init`, and iterate over instances inside the handler. Never register one listener per view or instance — that creates N duplicate listeners for the same key. See the `spellchecker.languages` listener in `packages/app/accounts.ts`.

## Shared utilities

- For time and duration values, import `ms` from `@meru/shared/ms` — don't install or import the `ms` npm package. Example: `import { ms } from "@meru/shared/ms"; const delay = ms("1d");`

## Scope and review bandwidth

- When the full feature spans several concerns such as IPC wiring, UI, and state broadcasting, land the plumbing first, then each consumer in its own turn. Track the follow-ups in the conversation, the PR description, or the feature's doc in `docs/features/` so they aren't lost.
- Open items to pick up in a **new session** — work unrelated enough to the current feature's goal that it shouldn't ride along with it — go to `docs/todo.md`, as short entries linking into `docs/` for context. It isn't a backlog for the in-progress feature, and it holds no knowledge: settled decisions go to `docs/decisions.md`, and feature roadmaps and handoffs to `docs/features/`.
