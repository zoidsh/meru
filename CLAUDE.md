# Meru – Claude Code Guidelines

## FIRST STEP — Required Before Any Work

**Run this before doing anything else in a session, no exceptions:**

```sh
bun install --frozen-lockfile
```

This installs dependencies and runs postinstall scripts (including the lefthook pre-commit hook). Skipping this causes missing packages, broken type checks, and unwanted build artifacts.

## Variable Naming

- Always use descriptive names. Never use single-letter or abbreviated names anywhere — including callback parameters.
  - `time` not `t`, `hours`/`minutes` not `h`/`m`
  - `startMinutes`/`endMinutes` not `s`/`e`
  - `aStart`/`aEnd`/`bStart`/`bEnd` not `aS`/`aE`/`bS`/`bE`
  - `event` not `e`, `error` not `err`, `index` not `i` (unless in a for loop counter)

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

- Name boolean-returning functions with the bare predicate prefix — `is`, `has`, `can`, `should`, `did`, `will` — matching Node.js, Lodash, React, and typescript-eslint's `naming-convention` rule (e.g. `isMacOSDoNotDisturbActive`, `hasUnreadMessages`, `canEdit`). Don't prefix with `get` to dodge a variable-name collision. Avoid the collision one of these ways instead:
  - Inline single-use calls — `if (!isMacOSDoNotDisturbActive()) { ... }` needs no local.
  - If a local is needed, name it for its purpose rather than mirroring the function — `const shouldSuppressSound = isMacOSDoNotDisturbActive();`.
  - Inside the defining module, name the internal cache `cachedValue` (or similar) instead of the predicate form, so the exported function owns the predicate name.

## File Naming

- Name files by the domain/topic they cover, not by the single function they currently contain. Prefer generic, higher-level names (`macos.ts`, `linux.ts`) over function-specific ones (`macos-dnd.ts`, `linux-window-controls.ts`) so related helpers can accrete into the same file over time instead of each living in its own tiny file. Only split when a file grows large enough that the current topic is clearly two topics.

## Dependencies

- Install packages with `bun add <package>` (or `bun add -d <package>` for dev dependencies). Never edit `package.json` or `bun.lock` manually to add or bump dependencies.

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

## Settings UI Patterns

- Structure settings fields as: `Field` > `FieldLabel` + `FieldDescription` + control component.
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

## Release Notes

- Release notes live only on GitHub Releases — do not commit a `RELEASE_NOTES.md` or `CHANGELOG.md` file. Match the style of recent published releases at https://github.com/zoidsh/meru/releases.
- Output the release notes in chat for pasting into the GitHub release — do not write them to a file in the repo.
- Structure: use `## Added`, `## Changed`, `## Fixed`, `## Internal Changes` sections (in that order, omit unused ones). Skip `## Internal Changes` entirely when nothing affects end users (e.g. CI, CLAUDE.md, repo tooling).
- Classify each change correctly:
  - `Added` — new feature or capability
  - `Changed` — intentional change to existing behavior, rename, or default
  - `Fixed` — resolves a bug or unintended behavior (e.g. windows stacking awkwardly)
- Write user-facing, not commit-facing. Describe what changed for the user, not the commit history or implementation. Merge multiple commits for one feature into a single bullet.
- Lead with outcome, not mechanism. "New windows no longer stack on top of each other" beats "Added cascading window positioning". Avoid internal jargon like "patch-burst" or "debounce".
- Prefix Pro-only features with `**Meru Pro:**`.
- Skip changes that aren't user-observable given existing constraints (e.g. don't mention gating a feature behind Pro if free-tier limits already made it inaccessible).
- Reference settings paths as `Settings... → Section → Option`.
- Group related bullets next to each other (e.g. all Google Apps changes together).
- Use sub-bullets for details: options list, defaults, keyboard shortcuts, behavior nuances. Always state the default for new options.
