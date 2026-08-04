# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Workspace apps tabs — remaining roadmap (handoff, 2026-08-04)

The planning notes for this feature lived in machine-local files; this section is the complete, self-contained handoff. All planned workspace-apps-tabs work through PR #658 is merged: embedded tabs with pinned-tab persistence and restore, bookmarked apps in the "+" New Tab menu, Chrome modifier gestures (#650), reopen closed tab (#651), tab context-menu polish with Chrome wording (#655), "Google " prefix stripped from tab titles (#656), pinned/unpinned divider in the narrow strip (#657), and the Arc-style pinned icon grid in the wide strip (#658). Remaining work, in recommended order:

### 1. Meet screen-share picker fix (small, an actual bug — do this first)

- Bug: `registerSessionDisplayMediaRequestHandler` in `packages/app/account.ts` locates the Meet instance by filtering `Account.windows` with `instanceof BrowserWindow`. An embedded Meet **tab** never matches, so the handler falls through to `callback({})` and screen sharing is silently denied in embedded Meet.
- Fix: also match embedded Meet instances and parent the source-picker to `main.window` in that case.

### 2. Drag-and-drop tab reordering (plan agreed, not started)

- Use `@dnd-kit/react` following the existing pattern in the bookmarked-apps editor (`packages/renderer-main/routes/settings/workspace-apps.tsx`).
- `useSortable` per strip tab; the Gmail tab is fixed (not draggable, nothing can drop above it).
- Dragging across the pinned/unpinned boundary pins/unpins the tab, like Chrome.
- New `tabs.moveTab` IPC → `Tabs.moveTab` in `packages/app/tabs.ts`: splice to the new index, then `reorderTabs()` (enforces Gmail → pinned → unpinned) and `savePinnedTabs()` — pinned order persists for free because `serializePinnedTabs` walks the list in order.
- Risk to verify first: dnd-kit sorting across the two differently-laid-out containers (pinned grid vs unpinned list) in the wide strip.

### 3. Configurable + toggleable strip width (memo)

- Strip width behavior becomes **configurable and also toggleable**: a config key (proposed union `auto | narrow | wide`, default `auto` = current automatic switching in `getTabStripWidth`) rendered with `ConfigSelectField`, plus a runtime toggle (menu item and/or shortcut) to flip it without opening settings.
- Config only affects width, never visibility. `narrow` implies no pinned grid (the grid is wide-only).

### 4. Detach/adopt tab ↔ window (plan agreed; two PRs, detach first)

- Core mechanism for both directions: re-parent the **live** `WebContentsView` between `main.window.contentView` and a `BrowserWindow`'s `contentView` — no reload, page state survives.
- Detach: tab context-menu item "Move to New Window". Unpins the tab if pinned; does not record into the recently-closed stack.
- Adopt: titlebar button on workspace-app windows moves the view into the main window as a tab, then destroys the window shell — guard the window close handler so it doesn't tear down the re-parented view.

### 5. Needs discussion before implementation (parked)

- Resting state when only Gmail is open: without bookmarked apps the strip is hidden (then the only first-tab entry points are links and settings); with bookmarks it shows permanently as lone Gmail tab + "+". Is that the desired resting state? Auto-hide? Does the no-bookmarks state need an entry point?
- Zoom targeting: menu zoom still drives the `gmail.zoomFactor` config; `WorkspaceApp` has its own `zoomIn/zoomOut/resetZoom`. One API over the active tab is wanted (overlaps the convergence backlog below).

### Wording conventions + minor leftover

- Page-link actions everywhere use exactly "Copy Link" and "Open in Default Browser"; tab context menu mirrors Chrome: "Reload", "Duplicate", "Pin"/"Unpin", "Close", "Close Other Tabs", "Close Tabs Below", "Reopen Closed Tab". Identifiers deliberately keep `copyUrl`-style names.
- Known leftover: the strip close-button hover tooltip still says "Close Tab" (deliberately left; Chrome-wording pass covered menus only).

### Process notes for the next session

- Implementation was delegated to Opus subagents (Agent tool, `model: "opus"`, worktree isolation for parallel PRs); planning, review, and PR prose stayed with the main model. Keep that split.
- Dependent PRs use GitHub stacked PRs (`gh stack link` / `gh stack merge`) and every PR description ends with a Test plan — both already documented in CLAUDE.md.

## Gmail/WorkspaceApp convergence backlog

Later steps of converging `Gmail` onto the `WorkspaceApp` architecture (the near-term steps — live getters, store dedupe, shared view-event wiring, Gmail tab title — are being done as part of the feature work):

- **Shared `createView` recipe** — both classes build a `WebContentsView` with session+preload, add it as a child view, wire context menu, zoom limits, find-in-page broadcasts, window-open handler, devtools, and `loadURL`. Extract once into `packages/app/lib/web-contents.ts`.
- **Zoom unification** — `WorkspaceApp` has `zoomIn/zoomOut/resetZoom` with clamping; Gmail zoom lives in the `gmail.zoomFactor` config plus menu branches. One API over the active tab's webContents should serve both (also needed by the menu rework phase).
- **`Account.windows` diet** — the `Set<BrowserWindow | WebContentsView>` predates the tabs collection; embedded views are tracked twice. Making it windowed-only simplifies the `instanceof BrowserWindow` filters in the display-media handler and `gmail.closeComposeWindow`.
- **Lazy view creation (needs discussion)** — every null-safe Gmail getter exists because `Gmail` instances are constructed in `accounts.init()` before the main window exists, while `WorkspaceApp` creates its view in the constructor. `Gmail extends WorkspaceApp` only becomes clean if Gmail instance/view creation moves after `main.init()` — an ordering change that would retire the `_view`-throwing-getter pattern entirely. Discuss before attempting.

## Workspace App context-menu entries

Add "Copy Link" and "Open in Default Browser" entries to the right-click context menu for non-Gmail-view windows — extend `setupWindowContextMenu` in `packages/app/context-menu.ts`, guarded with `window !== accounts.getSelectedAccount().instance.gmail.view`. Gives immediate discoverability even for users who don't end up using the toolbar UI.
