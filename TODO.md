# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Workspace apps tabs — remaining roadmap (handoff, 2026-08-04, updated 2026-08-05)

The planning notes for this feature lived in machine-local files; this section is the complete, self-contained handoff. All planned workspace-apps-tabs work through PR #668 is merged: embedded tabs with pinned-tab persistence and restore, bookmarked apps in the "+" New Tab menu, Chrome modifier gestures (#650), reopen closed tab (#651), tab context-menu polish with Chrome wording (#655), "Google " prefix stripped from tab titles (#656), pinned/unpinned divider in the narrow strip (#657), the Arc-style pinned icon grid in the wide strip (#658), the Meet screen-share fix for embedded tabs (#659), the tab strip width setting (#662), Chrome-wording close tooltip (#663), page-link actions in the workspace-app context menu (#664) later moved into the window titlebar menu (#666), and detach/adopt tab ↔ window — detached tabs persist in the strip with a window indicator, "Move to Tab" lives in the titlebar menu (#660, #661), narrow-strip pinned apps as outline buttons without the divider (#667), and fade-out tab titles instead of ellipsis truncation (#668). Remaining work, in recommended order:

### 1. Drag-and-drop tab reordering (plan agreed, not started)

- Use `@dnd-kit/react` following the existing pattern in the bookmarked-apps editor (`packages/renderer-main/routes/settings/workspace-apps.tsx`).
- `useSortable` per strip tab; the Gmail tab is fixed (not draggable, nothing can drop above it).
- Dragging across the pinned/unpinned boundary pins/unpins the tab, like Chrome.
- New `tabs.moveTab` IPC → `Tabs.moveTab` in `packages/app/tabs.ts`: splice to the new index, then `reorderTabs()` (enforces Gmail → pinned → unpinned) and `savePinnedTabs()` — pinned order persists for free because `serializePinnedTabs` walks the list in order.
- Risk to verify first: dnd-kit sorting across the two differently-laid-out containers (pinned grid vs unpinned list) in the wide strip.

### 2. Needs discussion before implementation (parked)

- Resting state when only Gmail is open: without bookmarked apps the strip is hidden (then the only first-tab entry points are links and settings); with bookmarks it shows permanently as lone Gmail tab + "+". Is that the desired resting state? Auto-hide? Does the no-bookmarks state need an entry point?
- Zoom targeting: menu zoom still drives the `gmail.zoomFactor` config; `WorkspaceApp` has its own `zoomIn/zoomOut/resetZoom`. One API over the active tab is wanted (overlaps the convergence backlog below).

### 3. Strip polish memos (2026-08-05)

- List **all** of an account's workspace-app windows in the strip with the window indicator, not just detached tabs (decided 2026-08-05 when scoping the persistent-tab rework of the detach PR). **Mostly done as of 2026-08-09:** apps opened straight into a window are pushed onto the tabs list, so they show like any other windowed entry, and `Settings… → Appearance → Vertical Tabs → Show Windows` turns the whole listing off for anyone who wants the strip to mean tabs only. Still outside the list: popups such as the PDF viewer, which are never tabs. Whether they belong there needs the design pass the original note asked for.

### Wording conventions

- Page-link actions everywhere use exactly "Copy Link" and "Open in Default Browser"; tab context menu mirrors Chrome: "Reload", "Duplicate", "Pin"/"Unpin", "Close", "Close Other Tabs", "Close Tabs Below", "Reopen Closed Tab", "Move to New Window"/"Move to Tab". Identifiers deliberately keep `copyUrl`-style names.

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

## Vertical tabs strip — parked ideas (2026-08-09)

Both came out of the post-3.58.0 feedback round and were deliberately parked while the launcher and Workspace Apps mode work landed. Neither is started.

### Horizontal tabs for pinned workspace apps

Users who keep only a few workspace apps pinned (three or so) find a full-height vertical strip a poor trade for the width it costs. The idea is an option to lay pinned workspace apps out horizontally, browser-style, instead.

Plain "horizontal instead of vertical" is not the answer — horizontal tabs stop scaling as soon as many tabs are open, which is why the strip is vertical in the first place. The shape worth exploring is the hybrid: **pinned workspace apps horizontal, normal tabs still vertical**. That needs a design pass before any code — where the horizontal row sits relative to the titlebar, what happens to the strip when no normal tabs are open, and how the Workspace Apps launcher (which now lives in the strip while the strip is visible) fits in.

### Show/hide toggle for the strip

A button to collapse and restore the vertical tabs strip. Open questions: where the toggle lives (titlebar, or an edge affordance on the strip itself), whether the collapsed state persists and per account or globally, and how it interacts with the launcher moving between the strip and the titlebar.

### Bookmarks reachable from the titlebar

Bookmarked workspace apps live only in the tab strip, so in the `New Windows` mode added by #734 they cannot be reached at all — and there is no way to bookmark anything either, since bookmarking is a tab context-menu action. Both need an entry point that does not depend on the strip, most likely in the titlebar alongside the Workspace Apps launcher. Until that exists, #732 documents the gap as a known limitation of `New Windows` mode, and #734's switch confirmation deliberately does not warn about bookmarks, because the state it would describe is on its way out.
