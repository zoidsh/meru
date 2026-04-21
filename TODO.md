# TODO

## Refactor: route all electron-log usage through `lib/log.ts`

`packages/app/lib/log.ts` wraps `electron-log/main` and re-exports it as `log`. It's currently only used by `packages/app/lib/macos.ts`. The following files still import `electron-log` directly and should be migrated to the wrapper for a single source of truth (and so future log-config changes only need to touch one file):

- `packages/app/updater.ts`
- `packages/app/trial.ts`
- `packages/app/license-key.ts`
- `packages/app/ipc.ts`
- `packages/app/menu.ts`
- `packages/app/gmail/index.ts`

Each currently does `import log from "electron-log"`; switch to `import { log } from "./lib/log"` (adjust relative path per file).
