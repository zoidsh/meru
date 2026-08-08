# Meru – Claude Code Guidelines

## Setup

```sh
bun install --frozen-lockfile
```

This runs postinstall scripts, including the lefthook pre-commit hook. Skipping it causes missing packages, broken type checks, and unwanted build artifacts.

## Dependencies

- Always install packages as dev dependencies with `bun add -d <package>`. Rolldown/Vite bundle everything at build time, and Electron builder re-bundles anything in `dependencies` into the shipped app, so normal deps would ship duplicated. The only exception is packages with native modules that Electron needs to load at runtime — those must go in `dependencies` so electron-builder can package them correctly.

## UI Components

- Components in `packages/ui` follow shadcn conventions. Many are compound components with named sub-components (e.g. `Item` → `ItemContent`, `ItemActions`, `ItemTitle`, `ItemDescription`). Always read the component file before use to find available sub-components and use them instead of plain `<div>` wrappers.
- Never repeat shared classes across the branches of a conditional `className`. Hoist them and merge with the `cn` helper (`@meru/ui/lib/utils`): `cn("absolute hidden", isWide ? "size-5" : "size-4")`.
- Consider the platform when showing platform-specific information (modifier keys, OS names): branch on the existing `platform` helper — `@/lib/utils` in the renderer, `@electron-toolkit/utils` in the main process — e.g. `platform.isMacOS ? "Cmd" : "Ctrl"`.
- Render keyboard keys in user-facing text with the `Kbd` component (`@meru/ui/components/kbd`), not as plain text: `Hold <Kbd>Shift</Kbd> to …`.
- Child `WebContentsView`s always paint above the main window's HTML, so renderer-drawn overlays (dropdowns, tooltips, dialogs) get covered wherever a view sits. Keep overlays inside the regions the renderer owns (titlebar, vertical tabs) — e.g. vertical tabs menus open with `side="top"` at anchor width. For overlays over view content, use a native `Menu.popup` or a dedicated `WebContentsView` (see the recent-downloads popup).

## Settings UI Patterns

- Structure settings fields as: `Field` > `FieldLabel` + `FieldDescription` + control component.
- Render config-backed fields with the existing wrapper components rather than hand-rolling `Field` + control: `ConfigSwitchField` for a boolean key, `ConfigSelectField` for a string-union key (both in `packages/renderer/components/`). Each enforces its key's type at runtime, so the value type dictates the component — a fixed set of named choices should be modeled as a string union + `ConfigSelectField`, not a boolean + switch.
- In a `ConfigSelectField`, list the option matching the config default first in `items`.
- Access config via `useConfig()` and persist changes via `useConfigMutation()`.
- Use `toast.error()` for validation errors — never throw or console.error for user-facing feedback.
- Always guard against unloaded config with an early return before accessing config values:

  ```ts
  if (!config) {
    return;
  }
  ```

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

- Keep the initial slice of a feature small and self-contained. Split larger work into incremental changes the user can read one at a time — mental bandwidth to review is a real constraint, and a sprawling change across many files is harder to absorb than three smaller ones.
- When the full feature spans several concerns (e.g. IPC wiring, UI, state broadcasting), land the plumbing first, then each consumer in its own turn. Track the follow-ups inline in the conversation and/or in the PR description so they aren't lost.
- `TODO.md` (at the repo root) is reserved for work that should be picked up in a **new session** — items unrelated enough to the current feature's goal that they shouldn't ride along with it. Do not use `TODO.md` as a backlog for the in-progress feature itself.
- This is not about doing less work overall — it's about staging it so each step is easy to read, question, and approve.
- Make only the change that was asked for. Don't add adjacent styling, props, classes, or behavior that wasn't requested, even if it seems like an improvement (e.g. a destructive text tint on a delete button). When restyling to "match the app", reference a sibling component/page and reuse its exact variants and classes rather than inventing new ones.

## Release Notes

- For writing release notes, use the `release-notes` skill (`.claude/skills/release-notes/SKILL.md`).
