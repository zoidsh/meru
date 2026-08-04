# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Gmail/WorkspaceApp convergence backlog

Later steps of converging `Gmail` onto the `WorkspaceApp` architecture (the near-term steps — live getters, store dedupe, shared view-event wiring, Gmail tab title — are being done as part of the feature work):

- **Shared `createView` recipe** — both classes build a `WebContentsView` with session+preload, add it as a child view, wire context menu, zoom limits, find-in-page broadcasts, window-open handler, devtools, and `loadURL`. Extract once into `packages/app/lib/web-contents.ts`.
- **Zoom unification** — `WorkspaceApp` has `zoomIn/zoomOut/resetZoom` with clamping; Gmail zoom lives in the `gmail.zoomFactor` config plus menu branches. One API over the active tab's webContents should serve both (also needed by the menu rework phase).
- **`Account.windows` diet** — the `Set<BrowserWindow | WebContentsView>` predates the tabs collection; embedded views are tracked twice. Making it windowed-only simplifies the `instanceof BrowserWindow` filters in the display-media handler and `gmail.closeComposeWindow`.
- **Lazy view creation (needs discussion)** — every null-safe Gmail getter exists because `Gmail` instances are constructed in `accounts.init()` before the main window exists, while `WorkspaceApp` creates its view in the constructor. `Gmail extends WorkspaceApp` only becomes clean if Gmail instance/view creation moves after `main.init()` — an ordering change that would retire the `_view`-throwing-getter pattern entirely. Discuss before attempting.

## Workspace App context-menu entries

Add "Copy Link" and "Open in Default Browser" entries to the right-click context menu for non-Gmail-view windows — extend `setupWindowContextMenu` in `packages/app/context-menu.ts`, guarded with `window !== accounts.getSelectedAccount().instance.gmail.view`. Gives immediate discoverability even for users who don't end up using the toolbar UI.
