---
updated: 2026-08-26
---

# Electron memory: what the ecosystem knows

The outward-looking companion to [the memory audit](memory-audit.md). The audit was produced by reading Meru's own code, so it could only find what the code shows; this document covers what the Electron and Chromium ecosystem knows about memory that a code read structurally cannot surface — process-model levers, runtime flags, V8 and Blink behavior, what other apps published about their own memory work, and how to measure honestly — and maps each piece onto Meru: applies here, already covered, or a bad fit and why.

Researched on 26 August 2026 against Electron 43.2.0 (Chromium 150.0.7871.129), which is what `bun install` resolves for `^43.2.0` today. Every claim carries one of three labels:

- **[tested]** — run against Electron 43.2.0 on this machine, in this session.
- **[source]** — read in Electron `43-x-y` or Chromium 150 source, or in current official docs, by the research pass.
- **[secondhand]** — a vendor's blog, an issue thread, or community measurement. Numbers under this label are that vendor's, on their app, at their date.

One correction from the testing is worth stating up front as a caution about the other two labels: the research pass read Electron source as saying `app.getAppMetrics()` returns no `memory` field on Linux, and a live probe shows Electron 43.2.0 returning `workingSetSize` on Linux just fine **[tested]**. Source reads can trail the shipped binary — anything below that a decision would ride on deserves the same probe treatment first.

## New levers the audit could not see

### Discard and rebuild has a supported primitive: `navigationHistory.restore`

Electron has no `webContents.discard()` — the feature request mirroring Chrome's Memory Saver ([electron#38278](https://github.com/electron/electron/issues/38278)) has been open since 2023 with no maintainer engagement, and Chromium's content-layer `WebContentsDiscard` feature is desktop-disabled **[source]**. Destroy-and-recreate is the only real discard in Electron, which is exactly what the hibernation work built for finding 1.3.

What the audit's plan hand-rolled, though, now has API support: `webContents.navigationHistory.getAllEntries()` plus `navigationHistory.restore({ entries, index })` exists in Electron 43 **[tested]** and is documented as best-effort restoring form values and scroll position along with the history — precisely the "waking loses scroll and form state" cost the 1.3 plan accepts. Worth evaluating as a replacement for the in-memory history capture in `packages/app/lib/load-url.ts`.

### A middle state between hidden and destroyed: freezing over CDP

Chromium's page lifecycle has a `frozen` state that stops a page's task queues while keeping its process, and Blink schedules a **memory purge, including a full V8 GC, when a page in a backgrounded renderer freezes** — measured in Chromium's own review threads at 10–50 MB per renderer **[secondhand]**. Chrome uses this for Energy Saver; none of that chrome-layer machinery exists in Electron, but the state itself is reachable: attach `webContents.debugger` and send `Page.setWebLifecycleState` with `{ state: "frozen" }`. Electron 43.2.0 accepts the command and thaws cleanly with `"active"` **[tested]**; the memory effect on a real Gmail document is unmeasured here.

Why this matters for Meru specifically: finding 1.1 hides inactive account views and finding 1.3 destroys idle ones, and the space between them — a hidden Gmail view that keeps its process but drops 10–50 MB and stops burning CPU — is currently unoccupied. A frozen page runs no timers at all, so the same badge problem as full hibernation applies (below). Two caveats: the CDP method is marked experimental and can change without notice **[source]**, and an attached debugger disables the MV3 extension idle timer, so freezing must not share a strategy with extension-hosting views without checking that interaction.

### Hibernating a mail view without losing badges: the ecosystem's one honest answer

Every multi-service Electron host converged on hibernation, and unread badges are always the casualty, because the badge is scraped by a script inside the very page being unloaded:

- **Franz/Ferdi/Ferdium** hibernate per-service webviews (~170 MB back per hibernated service **[secondhand]**), and their trackers carry years of "badges vanish for hibernated services" issues; the mitigation that stuck is periodically waking renderers just to check for messages **[secondhand]**.
- **Rambox** documents the tradeoff officially: their own support pages tell users _not_ to enable hibernation for email and messaging apps, because a hibernated app cannot check for new messages **[secondhand]**.
- **Slack** (2017) is the one that solved it rather than living with it: background teams were swapped to a ~1,200-line "slim" page whose only jobs were unread indicators and notifications, with the expensive part being server-side — an endpoint answering `has_unreads` cheaply, and the server pre-evaluating notification preferences and pushing display-ready notifications, so the slim client needed no data model ([slack.engineering](https://slack.engineering/reducing-slacks-memory-footprint/)) **[secondhand]**.

The mapping onto Meru is direct, and it validates a plan the audit already holds: hibernating Gmail views (the 1.3 extension blocked on 1.2) requires unread counts and notifications to come from somewhere that is not the live Gmail DOM — which is exactly the main-process feed poller the 1.2 plan proposes (`session.fetch` against the inbox feed). Slack's arc is also a caution about ceilings: the slim-page system was a stopgap, and their durable fix was the 4.0 rewrite to a single renderer with lazily loaded data ("up to 50% less memory" **[secondhand]**) — a shape Meru cannot take, because Gmail is Google's app, not Meru's.

The guard list, assembled from what broke elsewhere, for whenever Gmail-view hibernation is designed: never hibernate a view with a dirty compose (Ferdium's data-loss issue; Discord's auto-restart guards on exactly the analogous "not in a call, user idle" conditions **[secondhand]**), never one playing audio (already in the 1.3 plan), and stagger wake-ups so several hibernated views don't rematerialize at once (Ferdium's "splay" **[secondhand]**).

### One throttling opt-out unthrottles the whole window

Two behaviors of `backgroundThrottling` that the Electron docs and source state and the audit had no way to see **[source]**:

1. **Window-level aggregation.** When at least one WebContents displayed in a window has throttling disabled, _frames are drawn and swapped for the whole window_ — every other view in it loses the benefit. Meru creates Gmail views with `backgroundThrottling: false` and re-enables it after load (`packages/app/accounts.ts`), so the aggregate is correct at rest today, but any future view that keeps `false` silently unthrottles the window for everyone. Worth a comment at the creation site; worth checking any new view type against.
2. **The `visibilitychange` trap.** With throttling disabled, a hidden or occluded page keeps reporting `visibilityState === "visible"` and never fires `visibilitychange` — so a page that gates its own work on visibility (which is what we want Gmail to do when 1.1 hides it) only gets that signal when throttling stays on. This is an argument for Option A (keep throttling on) in the 1.1 plan's open decision, with the badge-lag risk it names handled by the 1.2 feed poller rather than by unthrottling.

Related, for the 1.1 implementation: hidden windows with throttling disabled hit a Chromium frame-eviction blank-view bug ([electron#42378](https://github.com/electron/electron/issues/42378)) **[source]**, and Slack's webview-era motivation for migrating to BrowserView was precisely "hidden views sometimes fail to render when re-shown" **[secondhand]** — the `refreshSelectedAccountView` workaround the plan already preserves is this class of bug, so the plan's regression tests for hide/show cycles are load-bearing, not paranoia.

### Renderer heap flags: two knobs, one measurement each

V8's defaults favor speed over footprint, and two flags shift that balance for every renderer at once via `app.commandLine.appendSwitch("js-flags", ...)` before `ready` **[source]**:

- `--max-semi-space-size=N` — the young-generation size. Smaller means less resident memory and more frequent scavenges; it is the best-documented size/CPU tradeoff knob V8 has **[secondhand]**.
- `--optimize-for-size` — still present in V8 as of August 2026 (verified in `flag-definitions.h` **[source]**), favors memory over speed and clamps semi-spaces to 1 MB. It is a V8-internal flag with no stability contract.

Both would apply to Gmail's renderers — the dominant term nothing else reaches — and both trade GC CPU for it, so neither should land without a before/after through `test:perf` plus an eye on CPU-to-idle. Two non-flags to record alongside: V8's memory reducer (idle-time shrinking GC) is already on by default, and `--max-old-space-size` is a _cap_, not a reducer — it lowers steady-state memory only by making GC desperate near the limit, and pointer compression (in every Electron build since 14) caps every isolate at 4 GB regardless **[source]**.

### Smaller applicable items

- **Spellchecker dictionaries are per-language, per-session Hunspell loads on Windows and Linux** (macOS uses the native system spellchecker) **[source]**. Finding 4.4 turns spellcheck off where there is no input; the ecosystem addition is that trimming `spellchecker.languages` to what the user actually uses shrinks every session that keeps it on.
- **`v8CacheOptions: "bypassHeatCheck"`** is what VS Code ships and what the option's own author called a sane default for Electron apps **[source]**; the eager variant is explicitly warned to raise memory and GC pressure. This is a startup lever, roughly memory-neutral — worth knowing, not worth chasing for this audit.
- **`enableWebSQL` is dead** — WebSQL was removed in Electron 31, so the option is inert on 43 **[source]**. Nothing to do; recorded so nobody adds it.

## What the ecosystem confirms the audit already has

Independent confirmation is worth recording because it upgrades findings from "one code read says so" to "the platform's own guidance says so":

| Audit finding                  | Outside confirmation                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.5 config re-read/re-parse    | The Electron performance tutorial's own example of main-process waste is parsing large JSON; cache-and-invalidate is its prescription **[source]**                                                                        |
| 1.6/1.8 whole-store broadcasts | Electron IPC fully copies every payload through structured clone (both sides' copies become garbage); the platform guidance is delta-shaped payloads, exactly the key-level broadcast fix 1.6 proposes **[source]**       |
| 2.4 dark-theme image cache     | Platform guidance: bounded LRU caches over WeakRef schemes (V8's own docs say avoid weak references if possible); base64 strings cost ~1.33× the binary plus the decoded bitmap, and blob URLs keep one copy **[source]** |
| 2.6 `insertCSS` accumulation   | `removeInsertedCSS(key)` exists precisely because injected sheets otherwise persist for the document's life — the audit's fix is the platform's intended usage **[source]**                                               |
| 2.x leak cluster               | The canonical Electron leak classes in the ecosystem are exactly these: `ipcRenderer`/broadcast listeners never removed, and main-process closures keeping dead `webContents` graphs alive **[secondhand]**               |
| 3.7 unified-inbox recompute    | Virtualized lists are the universal recommendation for long rows; `content-visibility: auto` is the CSS-level variant **[source]**                                                                                        |
| 1.4 preload diet               | The Electron performance checklist is this finding generalized: bundle, defer requires, load lazily **[source]**                                                                                                          |
| Checked-in heap ceiling        | VS Code runs its helper JS processes under fixed `--max-old-space-size` ceilings and treats hitting one as a workload bug — the same shape as `tests/memory-budget.json` **[secondhand]**                                 |

One tool gap the confirmation pass surfaced: **memlab** (Meta) analyzes Electron heap snapshots and finds leaks by diffing an action against its undo, and **fuite** does the same lighter-weight. The perf harness's leak check compares counters across cycles; a snapshot-diff tool would name the retainers. Neither is urgent while the counters read zero growth.

## Bad fits and non-levers

Recorded so nobody re-researches them; several circulate as advice and are traps here.

- **`--disable-site-isolation-trials`** genuinely works in Electron (the switch beats Electron's forced strict isolation **[source]**) and would claw back the ~9–13% that site isolation costs plus the sign-in page's out-of-process iframe **[secondhand]**. It removes the process boundary between Gmail and every cross-origin frame Gmail embeds — in a mail client, the case site isolation exists for. The profiling doc already rejected this for one process; this generalizes the rejection to the flag.
- **Per-account partitions forbid cross-account process sharing, structurally.** Chromium's `IsSuitableHost` refuses to reuse a process across BrowserContexts/StoragePartitions, so no flag — not `--process-per-site`, not `--renderer-process-limit`, nothing — ever merges two accounts' renderers **[source]**. This independently re-derives the "Electron kept" decision's core claim: the only lever on the dominant term is how many Gmail renderers are live, which is the audit's P1 tier.
- **`--renderer-process-limit`** is a soft limit that site isolation overrides; Electron closed the feature request as not planned **[source]**. **`--process-per-site`** consolidates only within one partition, where Meru has one Gmail document anyway. **Chromium's `ProcessPerSiteUpToMainFrameThreshold`** is enabled but inert in Electron — the embedder hook it needs returns false there **[source]**.
- **The spare renderer is already gone.** Electron `43-x-y` unconditionally disables `SpareRendererForSitePerProcess` **[source]**; the circulating advice to disable it is already the default. (Electron main recently started warming one spare of its own for the first sandboxed window, opt-out by default — a thing to re-check on the next major upgrade, not now.)
- **`disableHardwareAcceleration()` / `--disable-gpu`** shift compositing memory into CPU bitmaps in the renderers, and since Electron 38 the GPU process sticks around anyway **[source]**. For an app that scrolls mail all day, a false economy. (The perf harness's local/CI GPU delta — 152 vs 64 MB — is this same effect read from the other side.)
- **`--memory-pressure-off` does not exist** in current Chromium, and **`TabSuspender`** never did — both appear in Electron memory blog posts and do nothing **[source]**. Electron also exposes no memory-pressure signal at all; there is nothing to subscribe to.
- **Custom V8 snapshots (mksnapshot)** are a startup tool with a runtime cost — VS Code measured snapshot-loaded code running 27–100% slower and shipped `v8CacheOptions` code caching instead **[secondhand]**; the Atom-era tooling is unmaintained. Not a memory lever, and Meru's startup work (the startup-reorder todo) should know the negative result.
- **`performance.measureUserAgentSpecificMemory()`** requires cross-origin isolation (COOP+COEP), which cannot be imposed on `mail.google.com` without breaking its subresources — unusable for the views that matter **[source]**.
- **Periodic `global.gc()`** fights the memory reducer and stops the world; legitimate only in tests (where the harness already uses it) and as a one-shot after a known large batch **[source]**.

## Measuring proportional memory: what the todo row was waiting for

The open todo row says the report should carry proportional or private memory rather than working set, and that the reader is platform-specific. The research settles what the honest number is and how each platform reads it without native modules:

**The number to copy is Chromium's own `PrivateMemoryFootprint`** — what Chrome's task manager shows and what Chrome's telemetry records. Its exact per-platform definition, from `CalculatePrivateFootprintKb` in Chromium source **[source]**:

| Platform | Definition                                                                               | Reader available to Meru                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Linux    | `RssAnon + VmSwap` from `/proc/<pid>/status`                                             | A file read per pid, microseconds; no page-table walk. `smaps_rollup` only needed if PSS itself is wanted (ms-scale per process) |
| macOS    | `phys_footprint` (from `task_info`) minus Chromium-tracked shared memory                 | No syscall from JS for child pids; see the CDP route below. `process.getProcessMemoryInfo().private` already returns it for main |
| Windows  | `PrivateUsage` from `GetProcessMemoryInfo` — private **commit**, not private working set | Already exposed: `getAppMetrics()[i].memory.privateBytes`, Windows-only, present in Electron 43's types **[tested via types]**   |

Three consequences for the report:

- **On Linux CI, the fix is nearly free**: read `/proc/<pid>/status` per child pid and report `RssAnon + VmSwap` as the footprint column. It is not PSS — it excludes file-backed shared pages entirely rather than prorating them — but it is Chromium-identical, additive across processes, and immune to the shared-page double-counting that makes working set overstate by 2×.
- **The cross-platform route with zero native code is a memory-infra dump over CDP**: `Tracing.start` with the `disabled-by-default-memory-infra` category, `Tracing.requestMemoryDump({ levelOfDetail: "background" })`, `Tracing.end`, then read `private_footprint_bytes` per process from the trace **[source]**. This is Chromium computing its own number, per platform, for every child including the ones `webContents` can't see. Note this is Chromium tracing, not the Playwright trace recorder that the "a profiled launch is not traced" decision removed — a different mechanism, but it still does work during the dump, so it belongs after the settle and its cost should be checked once against the node-count and CPU rows before trusting a run that used it.
- **`process.getProcessMemoryInfo().private` in main is already the right number** — it goes through Chromium's memory instrumentation, not an OS shortcut **[source]**. The harness already reports it; the todo row's "main private doesn't transfer between platforms" observation stands (the _definition_ differs per platform, commit vs footprint), so it stays a same-machine comparison figure.

Two Electron API facts worth pinning in the profiling doc: Electron exposes per-child _private_ footprint nowhere (the plumbing exists internally; no open issue even requests it), and `getAppMetrics()` memory on macOS is plain RSS, which macOS compression makes close to meaningless — the docs' own reason for omitting `residentSet` there **[source]**.

## Sources

Primary anchors, grouped; the per-claim labels above say which were read against source and which are vendor accounts.

- Electron: [performance tutorial](https://www.electronjs.org/docs/latest/tutorial/performance), [command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches), [web-preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences), [V8 memory cage blog](https://www.electronjs.org/blog/v8-memory-cage), [navigation-history API](https://www.electronjs.org/docs/latest/api/navigation-history), issues [#38278](https://github.com/electron/electron/issues/38278) (discard), [#42378](https://github.com/electron/electron/issues/42378) (frame eviction), [#37437](https://github.com/electron/electron/issues/37437) (renderer limit), [#42884](https://github.com/electron/electron/issues/42884), [#49960](https://github.com/electron/electron/issues/49960); source files `shell/browser/feature_list.cc`, `shell/browser/electron_browser_client.cc`, `shell/common/api/electron_bindings.cc` at `43-x-y`.
- Chromium: [process model and site isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md), [memory key concepts](https://chromium.googlesource.com/chromium/src/+/main/docs/memory/key_concepts.md), `CalculatePrivateFootprintKb` in `services/resource_coordinator/memory_instrumentation/queued_request_dispatcher.cc`, `RenderProcessHostImpl::IsSuitableHost`, [site isolation paper (Reis et al., USENIX 2019)](https://www.usenix.org/system/files/sec19-reis.pdf), [CDP Page.setWebLifecycleState](https://chromedevtools.github.io/devtools-protocol/tot/Page/).
- V8: [flag-definitions.h](https://raw.githubusercontent.com/v8/v8/main/src/flags/flag-definitions.h), [optimizing V8 memory](https://v8.dev/blog/optimizing-v8-memory), [code caching](https://v8.dev/blog/code-caching-for-devs), [weak refs](https://v8.dev/features/weak-references).
- Apps: [Slack slim footprint](https://slack.engineering/reducing-slacks-memory-footprint/), [Slack BrowserView migration](https://slack.engineering/growing-pains-migrating-slacks-desktop-app-to-browserview/), [Slack 4.0 rebuild](https://slack.engineering/rebuilding-slack-on-the-desktop/), [VS Code snapshot thread (v8-users)](https://groups.google.com/g/v8-users/c/KddMkLLHh2w), [VS Code sandboxing](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox), [Atom snapshots](https://atom-editor.cc/blog/2017/04/18/improving-startup-time), [Ferdium hibernation issues](https://github.com/ferdium/ferdium-app/issues/1490), [Rambox hibernation docs](https://rambox.app/features/hibernation/), [Obsidian deferred views](https://docs.obsidian.md/plugins/guides/defer-views).
- Measurement: [Linux smaps_rollup ABI](https://www.kernel.org/doc/Documentation/ABI/testing/procfs-smaps_rollup), [macOS footprint(1)](https://keith.github.io/xcode-man-pages/footprint.1.html), [Chromium consistent-memory-metrics thread](https://groups.google.com/a/chromium.org/g/chromium-dev/c/ELSYMXnvbBc), [memlab](https://github.com/facebook/memlab), [fuite](https://nolanlawson.com/2021/12/17/introducing-fuite-a-tool-for-finding-memory-leaks-in-web-apps/).
