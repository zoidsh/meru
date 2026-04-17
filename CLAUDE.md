# Meru – Claude Code Guidelines

## Variable Naming

- Always use descriptive names. Never use single-letter or abbreviated names.
  - `time` not `t`, `hours`/`minutes` not `h`/`m`
  - `startMinutes`/`endMinutes` not `s`/`e`
  - `aStart`/`aEnd`/`bStart`/`bEnd` not `aS`/`aE`/`bS`/`bE`

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
- Add empty lines around state updates (e.g. `setTimes(...)`) when they appear between other operations.

## Settings UI Patterns

- Use `FieldLabel` for new section headers inside `FieldSet` (not `FieldLegend`).
- Structure settings fields as: `Field` > `FieldLabel` + `FieldDescription` + control component.
- Access config via `useConfig()` and persist changes via `useConfigMutation()`.
- Use `toast.error()` for validation errors — never throw or console.error for user-facing feedback.

## Config Keys

- Follow the existing `"section.camelCase"` dot-notation pattern (e.g. `"notifications.times"`).
- Store time values as `"HH:mm"` 24-hour strings internally regardless of display format.
- Use `input[type="time"]` for time inputs — Chromium auto-adapts display to the OS locale (12h/24h), no extra handling needed.

## Formatting Tool

- Always run `bun fmt` after making code changes. It uses oxfmt to auto-format all files.
- Run `bun fmt:check` to verify formatting without making changes.

## General

- Follow the patterns and naming of the existing codebase. When in doubt, find a similar example in the codebase and match it exactly.
