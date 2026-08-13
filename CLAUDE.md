# Meru – Claude Code Guidelines

## Setup

```sh
bun install --frozen-lockfile
```

## Docs

- `docs/` is a separately cloned private docs repo, gitignored here; it may be absent on fresh checkouts. When present, read `docs/README.md` for what lives where.
- Check `docs/decisions.md` before reopening a settled design decision.
- Keep `docs/architecture/` current when changing the app's structure; larger features start as a design doc in `docs/features/` before implementation.

## Dependencies

- Always install packages as dev dependencies with `bun add -d <package>`. Rolldown/Vite bundle everything at build time, and Electron builder re-bundles anything in `dependencies` into the shipped app, so normal deps would ship duplicated. The only exception is packages with native modules that Electron needs to load at runtime — those must go in `dependencies` so electron-builder can package them correctly.

## UI Components

- Components in `packages/ui` follow shadcn conventions. Many are compound components with named sub-components (e.g. `Item` → `ItemContent`, `ItemActions`, `ItemTitle`, `ItemDescription`). Always read the component file before use to find available sub-components and use them instead of plain `<div>` wrappers.
- Never repeat shared classes across the branches of a conditional `className`. Hoist them and merge with the `cn` helper (`@meru/ui/lib/utils`): `cn("absolute hidden", isWide ? "size-5" : "size-4")`.
- Consider the platform when showing platform-specific information (modifier keys, OS names): branch on the existing `platform` helper — `@/lib/utils` in the renderer, `@electron-toolkit/utils` in the main process — e.g. `platform.isMacOS ? "Cmd" : "Ctrl"`.
- Render keyboard keys in user-facing text with the `Kbd` component (`@meru/ui/components/kbd`), not as plain text: `Hold <Kbd>Shift</Kbd> to …`.
- Child `WebContentsView`s always paint above the main window's HTML, so renderer-drawn overlays (dropdowns, tooltips, dialogs) get covered wherever a view sits. Keep overlays inside the regions the renderer owns (titlebar, vertical tabs) — e.g. vertical tabs menus open with `side="top"` at anchor width. For overlays over view content, use a native `Menu.popup` or a dedicated `WebContentsView` (see `Popup` in `packages/app/lib/popup.ts`).

## Settings UI Patterns

- Structure settings fields as: `Field` > `FieldLabel` + `FieldDescription` + control component.
- Render config-backed fields with the existing wrapper components rather than hand-rolling `Field` + control: `ConfigSwitchField` for a boolean key, `ConfigSelectField` for a string-union key (both in `packages/renderer/components/`). Each enforces its key's type at runtime, so the value type dictates the component — a fixed set of named choices should be modeled as a string union + `ConfigSelectField`, not a boolean + switch.
- In a `ConfigSelectField`, list the option matching the config default first in `items`.
- Access config via `useConfig()` and persist changes via `useConfigMutation()`.
- Use `toast.error()` for validation errors — never throw or console.error for user-facing feedback.

## Config Keys

- Follow the existing `"section.camelCase"` dot-notation pattern (e.g. `"notifications.times"`).
- When combining a global config check with more specific conditions (e.g. per-account flags, counts, or local state), always check the global setting first so it short-circuits the rest:

  ```ts
  // correct
  if (config.get("unifiedInbox.enabled") && accounts.length > 1) { ... }

  // wrong
  if (accounts.length > 1 && config.get("unifiedInbox.enabled")) { ... }
  ```

## Config Change Listeners

- Register a `config.onDidChange("some.key", ...)` listener once at the manager/collection level (e.g. in `Accounts.init`) and iterate over instances inside the handler. Never register one listener per view/instance — that creates N duplicate listeners for the same key. See the `spellchecker.languages` listener in `packages/app/accounts.ts`.

## Shared Utilities

- For time/duration values, import `ms` from `@meru/shared/ms` — do not install or import the `ms` npm package. Example: `import { ms } from "@meru/shared/ms"; const delay = ms("1d");`

## Scope and Review Bandwidth

- When the full feature spans several concerns (e.g. IPC wiring, UI, state broadcasting), land the plumbing first, then each consumer in its own turn. Track the follow-ups in the conversation, the PR description, or the feature's doc in `docs/features/` so they aren't lost.
- Open items to pick up in a **new session** — work unrelated enough to the current feature's goal that it shouldn't ride along with it — go to `docs/TODO.md`: short entries linking into `docs/` for context. It is not a backlog for the in-progress feature, and it holds no knowledge: settled decisions go to `docs/decisions.md`, feature roadmaps and handoffs to `docs/features/`.
