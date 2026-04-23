# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Google App context-menu entries

Add "Copy Link" and "Open in Default Browser" entries to the right-click context menu for non-Gmail-view windows — extend `setupWindowContextMenu` in `packages/app/context-menu.ts`, guarded with `window !== accounts.getSelectedAccount().instance.gmail.view`. Gives immediate discoverability even for users who don't end up using the toolbar UI.

## Google App toolbar keyboard shortcuts

The `GoogleApp` titlebar buttons (back, forward, reload, copy URL, open in browser) have click handlers but no accelerators. Wire up browser-conventional shortcuts — `Cmd+[` / `Cmd+]` for back/forward, `Cmd+R` for reload — scoped to the `GoogleApp` `BrowserWindow` (e.g. via `before-input-event` on the toolbar webContents, or a per-window `Menu.setApplicationMenu` swap on focus).
