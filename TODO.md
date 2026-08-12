# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Workspace apps tabs — remaining roadmap (handoff, 2026-08-04, updated 2026-08-05)

The planning notes for this feature lived in machine-local files; this section is the complete, self-contained handoff. All planned workspace-apps-tabs work through PR #668 is merged: embedded tabs with pinned-tab persistence and restore, bookmarked apps in the "+" New Tab menu, Chrome modifier gestures (#650), reopen closed tab (#651), tab context-menu polish with Chrome wording (#655), "Google " prefix stripped from tab titles (#656), pinned/unpinned divider in the narrow strip (#657), the Arc-style pinned icon grid in the wide strip (#658), the Meet screen-share fix for embedded tabs (#659), the tab strip width setting (#662), Chrome-wording close tooltip (#663), page-link actions in the workspace-app context menu (#664) later moved into the window titlebar menu (#666), and detach/adopt tab ↔ window — detached tabs persist in the strip with a window indicator, "Move to Tab" lives in the titlebar menu (#660, #661), narrow-strip pinned apps as outline buttons without the divider (#667), and fade-out tab titles instead of ellipsis truncation (#668). What has shipped since, and what is left:

### Drag-and-drop tab reordering (shipped)

Tabs reorder by dragging, using `@dnd-kit/react` with a sortable context per section in `packages/renderer/components/vertical-tabs.tsx` and a `tabs.moveTab` IPC into `Tabs.moveTab`. The Gmail tab is fixed and nothing drops above it.

**A tab can only be dragged within its own section** — decided 2026-08-12, against the original plan of pinning and unpinning by dragging across the boundary the way Chrome does. Crossing that line by accident silently changes whether a tab survives a restart, which is too much to hang on a drag that overshoots. Pin and unpin stay context-menu actions. `moveTab` enforces the rule in the main process by clamping the target index into the moved tab's own section, so it holds even if the renderer ever offers a wider drop area.

### Needs discussion before implementation (parked)

- Resting state when only Gmail is open: the strip is hidden, since `getVerticalTabsWidth` gives it no width below two visible tabs. Reaching a second app is no longer the worry the original note had — the launcher and the bookmarks button move to the titlebar whenever the strip is not there, with a fade for the handover. What is left is whether appearing and disappearing across that one-tab line is right at all, given it shifts the window's contents and moves two controls between hosts every time it is crossed, or whether the strip should stay once it has been used.

### 3. Strip polish memos (2026-08-05)

- List **all** of an account's workspace-app windows in the strip with the window indicator, not just detached tabs (decided 2026-08-05 when scoping the persistent-tab rework of the detach PR). **Mostly done as of 2026-08-09:** apps opened straight into a window are pushed onto the tabs list, so they show like any other windowed entry, and `Settings… → Workspace Apps → Vertical Tabs → Show Windows` turns the whole listing off for anyone who wants the strip to mean tabs only. Still outside the list: popups such as the PDF viewer, which are never tabs. Whether they belong there needs the design pass the original note asked for.

### Wording conventions

- Page-link actions everywhere use exactly "Copy Link" and "Open in Default Browser"; tab context menu mirrors Chrome: "Reload", "Duplicate", "Pin"/"Unpin", "Close", "Close Other Tabs", "Close Tabs Below", "Reopen Closed Tab", "Move to New Window"/"Move to Tab". Identifiers deliberately keep `copyUrl`-style names.

### Process notes for the next session

- Implementation was delegated to Opus subagents (Agent tool, `model: "opus"`, worktree isolation for parallel PRs); planning, review, and PR prose stayed with the main model. Keep that split.
- Dependent PRs use GitHub stacked PRs (`gh stack link` / `gh stack merge`) and every PR description ends with a Test plan — both already documented in CLAUDE.md.

## Gmail/WorkspaceApp convergence backlog

Later steps of converging `Gmail` onto the `WorkspaceApp` architecture (the near-term steps — live getters, store dedupe, shared view-event wiring, Gmail tab title — are being done as part of the feature work):

- **Shared `createView` recipe** — both classes build a `WebContentsView` with session+preload, add it as a child view, wire context menu, zoom limits, find-in-page broadcasts, window-open handler, devtools, and `loadURL`. Extract once into `packages/app/lib/web-contents.ts`.
- **`Account.windows` diet** — the `Set<BrowserWindow | WebContentsView>` predates the tabs collection; embedded views are tracked twice. Making it windowed-only simplifies the `instanceof BrowserWindow` filters in the display-media handler and `gmail.closeComposeWindow`.
- **Lazy view creation (needs discussion)** — every null-safe Gmail getter exists because `Gmail` instances are constructed in `accounts.init()` before the main window exists, while `WorkspaceApp` creates its view in the constructor. `Gmail extends WorkspaceApp` only becomes clean if Gmail instance/view creation moves after `main.init()` — an ordering change that would retire the `_view`-throwing-getter pattern entirely. Discuss before attempting.

## Workspace App context-menu entries

Add "Copy Link" and "Open in Default Browser" entries to the right-click context menu for non-Gmail-view windows — extend `setupWindowContextMenu` in `packages/app/context-menu.ts`, guarded with `window !== accounts.getSelectedAccount().instance.gmail.view`. Gives immediate discoverability even for users who don't end up using the toolbar UI.

## New Tab as a command palette (2026-08-12)

Meru has no blank tab — a tab is a workspace app — so New Tab has to be a chooser rather than an empty page. The shape wanted is a `Cmd+K` style dialog: a list to pick from, a field to type into, filtering as you type, Enter to open what is highlighted. `Cmd/Ctrl+T` is free for it.

To decide before building: what the list holds — the launcher apps, the bookmarks, every supported workspace app, or a ranked mix — and whether the field also takes a URL. Where it draws is the constraint that will shape it: child `WebContentsView`s paint above the renderer's HTML, which is why the bookmarks list is a popup rather than a dropdown (see CLAUDE.md). A dialog over the tab area has the same problem.

## Keyboard shortcuts settings page (2026-08-12)

Came out of choosing the Close Tab binding on 2026-08-12: the app now carries enough shortcuts that which key does what should be the user's answer rather than ours. A settings page listing every command with its keys, rebindable, resettable.

Two things are waiting on it. The nine `Ctrl+Shift+1..9` jumps to pinned tabs are hidden accelerators with nothing in the menu to reveal them, so until this page exists they can only be found by being told. And `Cmd/Ctrl+W` closes the main window rather than the active tab — a deliberate divergence from browsers, since keeping Gmail and the workspace apps open is the point of the app, closing the window is cheap and reversible, and closing a tab is the destructive act; Close Tab sits on `Cmd/Ctrl+Shift+W` instead. Anyone who wants the browser arrangement should be able to swap the two here.

## Investigate account views not rendering after show/restore (2026-08-12)

Surfaced by the comment audit. `Accounts.init` (`packages/app/accounts.ts:116`) blindly calls `refreshSelectedAccountView()` on the main window's `show` and `restore` events because the account views sometimes don't render after the window comes back — the view just doesn't paint sometimes when only `main.window.contentView.addChildView()` is called. The suspicion is a bug in Electron itself, but that is unconfirmed; the root cause was never found, and the refresh is the workaround. To investigate: pin down a reproduction, check whether a minimal Electron app shows it, search/file an upstream issue, and either link the issue at the workaround or replace it with a real fix.

## Google Docs menu paste wants a Chrome extension (2026-08-12)

Found while testing PR #723. Edit → Paste in Docs shows a dialog asking for the Google Docs extension to be installed instead of pasting. Menu Copy works, and Cmd/Ctrl+V is unaffected.

Not a permission problem, despite looking like one. The Docs page requests `chrome-extension://ghbmnnjooekpmoecnnnilnnbdlolhkhi/page_embed_script.js` — the Google Docs Offline extension — and the load fails with `ERR_FAILED`, because Electron has no Chrome extensions installed. Docs reads the missing script as "extension not installed" and offers the dialog without ever consulting a permission. `clipboard-read` is granted since #723 and `navigator.clipboard.readText()` returns the clipboard contents, so the async clipboard path underneath is working.

Routes if picked up: load the extension through `session.loadExtension` (needs a CRX off the Web Store, and Electron supports only part of the extension API), or intercept that `chrome-extension://` URL and serve a stub. Both want a look at what `page_embed_script.js` actually provides before either is worth attempting.

Worth knowing while debugging anything permission-shaped: `navigator.permissions.query()` is not a useful signal in Meru. The check handler in `packages/app/account.ts` returns `true` for everything except notifications, so almost every permission reports `granted` whether or not a request for it would be.

## Cmd+, should open Meru's settings (2026-08-12)

`Command+,` is currently the accelerator for **Gmail Settings…** in the app menu (`packages/app/menu.ts:264`), while **Settings…** — Meru's own settings — has no accelerator at all. Native apps put their own preferences on `Cmd+,`, so the two should swap: `Cmd+,` navigates to `/settings/general`, and Gmail Settings gets a different key or none.

To decide: what Gmail Settings moves to (`Cmd+Shift+,` is the obvious candidate), and whether the Windows/Linux side gains `Ctrl+,` at the same time — the current accelerator is macOS-only.

## Setting to hide Gmail's promo banner (2026-08-12)

Gmail shows a recommendation banner above the message list — e.g. a green "Security / Keep your team data safe / Upgrade to Standard for stronger defences in Gmail and Drive" strip with a "Try at no cost" button and an X. It eats vertical space on every inbox visit and comes back after being dismissed.

Add a setting that hides it, **on by default**. Follow the config-field conventions in CLAUDE.md (a boolean key + `ConfigSwitchField`).

To work out when picked up: where the hiding happens — injected CSS in the Gmail preload against whatever container Gmail wraps these in, versus a DOM-removal observer — and how stable the selector is across Gmail's markup churn, since a stale selector should degrade to "banner still shows", never to a broken inbox. Also worth checking whether the same treatment should cover Gmail's other top-of-list promos (Workspace upsells, "get the app", tips) or only this one.

## Horizontal tabs for pinned workspace apps (parked, 2026-08-09)

Came out of the post-3.58.0 feedback round and was deliberately parked while the launcher and Workspace Apps mode work landed. Not started.

Users who keep only a few workspace apps pinned (three or so) find a full-height vertical strip a poor trade for the width it costs. The idea is an option to lay pinned workspace apps out horizontally, browser-style, instead.

Plain "horizontal instead of vertical" is not the answer — horizontal tabs stop scaling as soon as many tabs are open, which is why the strip is vertical in the first place. The shape worth exploring is the hybrid: **pinned workspace apps horizontal, normal tabs still vertical**. That needs a design pass before any code — where the horizontal row sits relative to the titlebar, what happens to the strip when no normal tabs are open, and how the Workspace Apps launcher (which now lives in the strip while the strip is visible) fits in.
