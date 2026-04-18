# Meru – Claude Code Guidelines

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

## Functions Inside Components

- Never use `function` declarations inside a React component or another function. Always use `const` arrow functions:

  ```ts
  // correct
  const handleClick = () => { ... };

  // wrong
  function handleClick() { ... }
  ```

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

## Dependencies

- Always run `bun install --frozen-lockfile` at the start of any work session to ensure dependencies are installed. This also runs postinstall scripts including the lefthook pre-commit hook.

## Linting

- Never use `!` non-null assertions in TypeScript — enforced via `typescript/no-non-null-assertion` in `.oxlintrc.json`. Refactor the code to avoid them instead.

## Type Checking

- Always run `bun types:ci` after making code changes to verify there are no type errors.

## General

- Follow the patterns and naming of the existing codebase. When in doubt, find a similar example in the codebase and match it exactly.
