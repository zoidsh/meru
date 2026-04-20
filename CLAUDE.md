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

## Dependencies

- Install packages with `bun add <package>` (or `bun add -d <package>` for dev dependencies). Never edit `package.json` or `bun.lock` manually to add or bump dependencies.

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

## Linting

- Never use `!` non-null assertions in TypeScript — enforced via `typescript/no-non-null-assertion` in `.oxlintrc.json`. Refactor the code to avoid them instead.

## Type Checking

- Always run `bun types:ci` after making code changes to verify there are no type errors.

## General

- Follow the patterns and naming of the existing codebase. When in doubt, find a similar example in the codebase and match it exactly.
