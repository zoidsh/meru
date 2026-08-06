# Meru – Claude Code Guidelines

## Dependencies — Install Before Code Changes or Scripts

**Run this before making any code changes or running any scripts, no exceptions:**

```sh
bun install --frozen-lockfile
```

This installs dependencies and runs postinstall scripts (including the lefthook pre-commit hook). Skipping this causes missing packages, broken type checks, and unwanted build artifacts. Answering questions or exploring the codebase doesn't require it — only run it once you're about to change code or run a script.

## Variable Naming

- Always use descriptive names. Never use single-letter or abbreviated names anywhere — including callback parameters.
  - `time` not `t`, `hours`/`minutes` not `h`/`m`
  - `startMinutes`/`endMinutes` not `s`/`e`
  - `aStart`/`aEnd`/`bStart`/`bEnd` not `aS`/`aE`/`bS`/`bE`
  - `event` not `e`, `error` not `err`, `index` not `i` (unless in a for loop counter)
- Avoid generic/contextless names even when they're full words — pick a name that carries the domain. `raw`, `data`, `parsed`, `record`, `result`, `value`, `item`, `obj`, `tmp` are all red flags on their own. Prefer `gtkDecorationLayout` over `layout`, `savedLanguages` over `languages`, `accountConfigs` over `configs`, `parentWindowBounds` over `parentBounds`. This lets a reader understand a line without tracing back to where the value came from.
- Applies equally to instance fields — `recentDownloadHistoryParentWindow` beats `popupParentWindow` because the field participates in the same "is the popup open?" check as `recentDownloadHistoryView`, and matching the domain prefix makes the pairing obvious.

## Code Formatting

- Separate logically distinct operations with empty lines. Only group lines that belong to the same context.
- Always use block-style `if` statements — never inline single-line returns:

  ```ts
  // correct
  if (!times.length) {
    return true;
  }

  // wrong
  if (!times.length) return true;
  ```

- Add an empty line before `if` blocks when preceded by other statements.
- Add an empty line before `return` statements when preceded by other statements.

## Comments

- Don't write comments. Clear code with descriptive names is the documentation — let it explain itself. Only add a comment when the logic is genuinely non-obvious (e.g. a subtle workaround or a non-intuitive constraint) and the reason can't be conveyed through naming or structure.

## Functions

- Root-level functions (including React components) use `function` declarations.
- Nested functions (inside a component or another function) use `const` arrow functions:

  ```ts
  // correct
  function MyComponent() {
    const handleClick = () => { ... };

    return <button onClick={handleClick} />;
  }

  // wrong
  const MyComponent = () => {
    function handleClick() { ... }

    return <button onClick={handleClick} />;
  };
  ```

- Name boolean-returning functions with the bare predicate prefix — `is`, `has`, `can`, `should`, `did`, `will` — matching Node.js, Lodash, React, and typescript-eslint's `naming-convention` rule (e.g. `isWithinNotificationTimes`, `isMailtoUrl`, `hasOverlap`). Don't prefix with `get` to dodge a variable-name collision. Avoid the collision one of these ways instead:
  - Inline single-use calls — `if (!isWithinNotificationTimes()) { ... }` needs no local.
  - If a local is needed, name it for its purpose rather than mirroring the function — e.g. `const shouldSuppressNotification = !isWithinNotificationTimes();`.

## File Naming

- Name files by the domain/topic they cover, not by the single function they currently contain. Prefer generic, higher-level names (`lib/linux.ts`, `lib/fs.ts`) over function-specific ones (`lib/linux-window-controls.ts`, `lib/file-exists.ts`) so related helpers can accrete into the same file over time instead of each living in its own tiny file. Only split when a file grows large enough that the current topic is clearly two topics.

## Dependencies

- Always install packages as dev dependencies with `bun add -d <package>`. Rolldown/Vite bundle everything at build time, and Electron builder re-bundles anything in `dependencies` into the shipped app, so normal deps would ship duplicated. The only exception is packages with native modules that Electron needs to load at runtime — those must go in `dependencies` so electron-builder can package them correctly. Never edit `package.json` or `bun.lock` manually to add or bump dependencies.

## Inline Single-Use Values

- Don't declare a variable (including a handler function) if it's only used once — inline it at the call site. Prop names like `onClick` or `onDragEnd` already describe what the function does.
- Only extract a named variable when the logic is complex enough that a name meaningfully improves readability.

  ```ts
  // correct — inlined
  <DndContext onDragEnd={(event) => {
    // ...
  }} />

  // wrong — named but only used once
  const handleDragEnd = (event) => { ... };
  <DndContext onDragEnd={handleDragEnd} />
  ```

## UI Components

- Components in `packages/ui` follow shadcn conventions. Many are compound components with named sub-components (e.g. `Item` → `ItemContent`, `ItemActions`, `ItemTitle`, `ItemDescription`). Always read the component file before use to find available sub-components and use them instead of plain `<div>` wrappers.
- Never repeat shared classes across the branches of a conditional `className`. Hoist them and merge with the `cn` helper (`@meru/ui/lib/utils`): `cn("absolute hidden", isWide ? "size-5" : "size-4")`.
- Consider the platform when showing platform-specific information (modifier keys, OS names): branch on the existing `platform` helper — `@meru/shared/renderer/utils` in renderers, `@electron-toolkit/utils` in the main process — e.g. `platform.isMacOS ? "Cmd" : "Ctrl"`.
- Render keyboard keys in user-facing text with the `Kbd` component (`@meru/ui/components/kbd`), not as plain text: `Hold <Kbd>Shift</Kbd> to …`.
- Child `WebContentsView`s always paint above the main window's HTML, so renderer-drawn overlays (dropdowns, tooltips, dialogs) get covered wherever a view sits. Keep overlays inside the regions the renderer owns (titlebar, tab strip) — e.g. tab strip menus open with `side="top"` at anchor width. For overlays over view content, use a native `Menu.popup` or a dedicated `WebContentsView` (see the recent-downloads popup).

## React State

- When multiple values always update together (same IPC payload, same effect, same callback), use a single `useState` object instead of splitting into separate hooks. Splitting only makes sense when the values can update independently.

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

## TypeScript

- Do not add explicit return types unless necessary — rely on inference.

## Shared Utilities

- For time/duration values, import `ms` from `@meru/shared/ms` — do not install or import the `ms` npm package. Example: `import { ms } from "@meru/shared/ms"; const delay = ms("1d");`

## Linting and Formatting

- Never use `!` non-null assertions in TypeScript — enforced via `typescript/no-non-null-assertion` in `.oxlintrc.json`. Refactor the code to avoid them instead.
- Do not run `bun run lint` or `bun run fmt:check` manually. The lefthook pre-commit hook runs `oxfmt` and `oxlint --fix` on staged files on every commit, so formatting and linting are enforced automatically.

## Type Checking

- Always run `bun types:ci` after making code changes to verify there are no type errors. (Type checks are NOT part of the pre-commit hook.)

## General

- Follow the patterns and naming of the existing codebase. When in doubt, find a similar example in the codebase and match it exactly.

## Scope and Review Bandwidth

- Keep the initial slice of a feature small and self-contained. Split larger work into incremental changes the user can read one at a time — mental bandwidth to review is a real constraint, and a sprawling change across many files is harder to absorb than three smaller ones.
- When the full feature spans several concerns (e.g. IPC wiring, UI, state broadcasting), land the plumbing first, then each consumer in its own turn. Track the follow-ups inline in the conversation and/or in the PR description so they aren't lost.
- `TODO.md` (at the repo root) is reserved for work that should be picked up in a **new session** — items unrelated enough to the current feature's goal that they shouldn't ride along with it. Do not use `TODO.md` as a backlog for the in-progress feature itself.
- This is not about doing less work overall — it's about staging it so each step is easy to read, question, and approve.
- Make only the change that was asked for. Don't add adjacent styling, props, classes, or behavior that wasn't requested, even if it seems like an improvement (e.g. a destructive text tint on a delete button). When restyling to "match the app", reference a sibling component/page and reuse its exact variants and classes rather than inventing new ones.

## Git Commits

- Don't use Conventional Commits. Match the style of the existing history: a short, lowercase, imperative summary with no type prefix (e.g. `add custom Gmail label colors`, `fix google app window not closing fully`, `remove stale todo`). The occasional `ci:` prefix on CI-only changes is the lone exception.
- Keep each commit to a single logical change.
- Always rebase onto the latest `main` before pushing (`git pull --rebase origin main`) — never merge. `main` must stay linear; merge commits are not allowed on it.

## Pull Requests

- Titles follow the same style as commit summaries: short, lowercase, imperative, no type prefix.
- Once a pull request is open, make further changes as new commits — don't amend and force-push. Incremental commits let the reviewer see what changed since their last look; pull requests are squash-merged, so `main` stays clean regardless.
- Keep the title and description accurate at all times. They describe what the branch contains **now**, not what it contained when the pull request was opened.
- Whenever the branch changes, update the title and description in the same step — never leave them describing an earlier version. This applies to reworks after review feedback, added or dropped scope, and rebases that change what the diff means.
- The description should cover the problem being solved, the changes made, and anything a reviewer needs in order to judge them — including deliberate omissions, known risks, and what has not been verified.
- End every description with a **Test plan** section: a numbered list of concrete steps to walk through in the running app to verify the work. Write each step as a user action with its expected outcome, and cover the changed behavior's edge cases (gated states, empty states, platform differences), not just the happy path. Keep it in sync with the branch like the rest of the description.
- Check the state of a pull request before acting on it rather than assuming it is unchanged. `gh pr list` only shows open pull requests, so one disappearing from the list means it was merged or closed.
- When new work depends on a pull request that is still open, don't wait for it to merge and don't base the work on `main` — branch off the open pull request's branch, open the new pull request with that branch as its base, and link the chain into a GitHub stack with `gh stack link <bottom> ... <top>` (bottom to top; PR numbers or branch names). GitHub then shows the stack on each pull request and retargets bases as parts merge; merge a whole chain atomically with `gh stack merge` instead of merging its pull requests one by one.

## Release Notes

- For writing release notes, use the `release-notes` skill (`.claude/skills/release-notes/SKILL.md`).
