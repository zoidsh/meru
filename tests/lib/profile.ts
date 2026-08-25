/*
 * What the performance tests measure, and what makes a measurement worth
 * comparing to another one.
 *
 * Three things separate this from calling `getAppMetrics()` and writing the
 * number down.
 *
 * Settling. A launched app is still doing work — parsing bundles, laying out,
 * fetching — and a figure taken partway through that says more about how busy
 * the machine was than about the app. `settle` waits until the app stops
 * spending CPU rather than for a fixed duration, so a slow runner waits longer
 * and a fast one does not pay for it.
 *
 * Collecting garbage. Heap figures taken without it measure when the collector
 * last happened to run. Measured here, a renderer reads 6.1 MB before and
 * 4.5 MB after, and the main process 9.1 MB before and 7.6 MB after — larger
 * than most of the regressions worth catching, and enough on its own to invent
 * or hide a leak across repeated cycles.
 *
 * Attribution. `getAppMetrics()` reports a `Tab` process with a pid and nothing
 * else, so the mapping from process to what it is running has to be built from
 * `webContents.getOSProcessId()`. That alone leaves a gap: site isolation puts
 * a cross-origin subframe in a process of its own, and no `webContents` reports
 * it. Frames are therefore walked as well, so that the sign-in page's
 * `accounts.youtube.com` frame is named rather than turning up as 86 MB nobody
 * can account for. Anything still unclaimed keeps the unattributed label, which
 * now means genuinely unexplained.
 */
import { ms } from "@meru/shared/ms";
import type { ElectronApplication, Page } from "playwright";

/** Gives up and samples anyway, since a busy app is itself worth reporting. */
const SETTLE_TIMEOUT = ms("30s");

const SETTLE_INTERVAL = ms("1s");

/**
 * CPU-seconds across every process in one interval, under which the app counts
 * as idle. An app doing nothing still wakes up for timers and compositor work,
 * so zero is never reached.
 */
const SETTLE_CPU_SECONDS = 0.05;

/**
 * Quiet intervals in a row before the app counts as settled. One is not enough:
 * loading a page has lulls in it — a network round trip is a lull — and calling
 * the first of them the end of startup samples an app that is still working.
 */
const SETTLE_QUIET_INTERVALS = 2;

export type ProcessSample = {
  /** Stable across runs, unlike the pid, so two reports line up by it. */
  label: string;
  type: string;
  /** Varies every run; here for someone reading a single report, not for diffing. */
  pid: number;
  workingSetKb: number;
  peakWorkingSetKb: number;
  cpuSeconds: number;
  idleWakeupsPerSecond: number;
};

export type RendererSample = {
  label: string;
  usedHeapKb: number;
  totalHeapKb: number;
  /** Blink's share, which is the DOM rather than the JavaScript heap proper. */
  embedderHeapKb: number;
  documents: number;
  nodes: number;
  jsEventListeners: number;
};

export type MainSample = {
  /** Null on macOS, where Electron does not report it. */
  residentSetKb: number | null;
  privateKb: number;
  sharedKb: number;
  usedHeapKb: number;
  totalHeapKb: number;
  blinkAllocatedKb: number;
};

export type Sample = {
  settleMs: number;
  processCount: number;
  webContentsCount: number;
  windowCount: number;
  totalWorkingSetKb: number;
  totalCpuSeconds: number;
  main: MainSample;
  processes: ProcessSample[];
  renderers: RendererSample[];
};

function bytesToKb(bytes: number) {
  return Math.round(bytes / 1024);
}

/**
 * What a page is, rather than where it is. Query strings hold the whole accounts
 * state on the main window and a fresh session identifier on Google's sign-in
 * page, so neither URL is the same twice and neither says anything a label
 * needs.
 */
function pageLabel(url: string) {
  if (!url) {
    return "about:blank";
  }

  try {
    const { protocol, hostname, pathname } = new URL(url);

    return protocol === "file:" ? (pathname.split("/").pop() ?? url) : hostname;
  } catch {
    return url;
  }
}

/** Total CPU-seconds spent by every process since it started. */
function readCpuSeconds(app: ElectronApplication) {
  return app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      // Optional in Electron's own types, being a newer addition than the rest
      // of `CPUUsage`, so it is defaulted rather than trusted.
      .reduce((total, metrics) => total + (metrics.cpu.cumulativeCPUUsage ?? 0), 0),
  );
}

/**
 * Waits for the app to stop working, and reports how long that took.
 *
 * The wait is on CPU spent rather than on the clock, because what a fixed sleep
 * buys differs by machine: ten seconds is plenty here and might be half of what
 * a loaded hosted runner needs. The time it took is returned rather than
 * discarded — a run that never settled is one whose figures deserve a second
 * look, and that only shows up if the number is in the report.
 */
export async function settle(app: ElectronApplication) {
  const startedAt = Date.now();

  let previous = await readCpuSeconds(app);

  let quietIntervals = 0;

  while (Date.now() - startedAt < SETTLE_TIMEOUT) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL));

    const current = await readCpuSeconds(app);

    quietIntervals = current - previous < SETTLE_CPU_SECONDS ? quietIntervals + 1 : 0;

    if (quietIntervals >= SETTLE_QUIET_INTERVALS) {
      return Date.now() - startedAt;
    }

    previous = current;
  }

  return Date.now() - startedAt;
}

/**
 * Collects garbage everywhere it can be asked for, so that what follows measures
 * what is retained rather than what has not been swept yet.
 *
 * The main process needs `--js-flags=--expose-gc`, which `useApp` passes when a
 * test asks to be profiled. Renderers do not: the debugging protocol collects on
 * request whatever the flags say, which is also why this reaches them that way
 * rather than by evaluating in the page.
 */
export async function collectGarbage(app: ElectronApplication, pages: Page[]) {
  await app.evaluate(() => {
    const collect = (globalThis as { gc?: () => void }).gc;

    if (!collect) {
      throw new Error(
        "The main process was launched without --js-flags=--expose-gc, so its heap cannot be measured. Pass { profile: true } to useApp.",
      );
    }

    collect();
  });

  for (const page of pages) {
    const session = await app.context().newCDPSession(page);

    try {
      await session.send("HeapProfiler.enable");

      await session.send("HeapProfiler.collectGarbage");
    } finally {
      await session.detach().catch(() => {});
    }
  }
}

async function sampleRenderer(app: ElectronApplication, page: Page): Promise<RendererSample> {
  const session = await app.context().newCDPSession(page);

  try {
    const heap = await session.send("Runtime.getHeapUsage");

    /*
     * `jsEventListeners` is the reason this is here rather than heap figures
     * alone. A listener registered on every detach and removed on none — which
     * finding 2.8 describes — moves this count and need not move a heap figure
     * at all, and counts are integers, so they carry no measurement noise
     * whatsoever.
     */
    const counters = await session.send("Memory.getDOMCounters");

    return {
      label: pageLabel(page.url()),
      usedHeapKb: bytesToKb(heap.usedSize),
      totalHeapKb: bytesToKb(heap.totalSize),
      embedderHeapKb: bytesToKb(
        (heap as { embedderHeapUsedSize?: number }).embedderHeapUsedSize ?? 0,
      ),
      documents: counters.documents,
      nodes: counters.nodes,
      jsEventListeners: counters.jsEventListeners,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

/**
 * What a process is, for a report to line up two runs by.
 *
 * Hostnames are deduplicated because two accounts can embed the same
 * cross-origin site, and Chromium may put both of those frames in one process —
 * which would otherwise read as `renderer:host+host`.
 *
 * A renderer nothing claims should no longer happen now that frames are walked
 * too. It keeps a label rather than being folded into a total, because a
 * nameless 86 MB inside one is worse than an honestly unexplained process.
 */
function processLabel(type: string, serviceName: string | null, urls: string[]) {
  if (type === "Browser") {
    return "main";
  }

  if (type === "GPU") {
    return "gpu";
  }

  if (type === "Utility") {
    return `utility:${serviceName ?? "unknown"}`;
  }

  const pages = [...new Set(urls.map(pageLabel))];

  return pages.length > 0 ? `renderer:${pages.join("+")}` : "renderer:unattributed";
}

/**
 * Makes every label unique, so that two accounts, or two windows on the same
 * origin, stay apart in a report instead of one overwriting the other.
 */
function disambiguate<Item extends { label: string }>(items: Item[]) {
  const seen = new Map<string, number>();

  return items.map((item) => {
    const count = (seen.get(item.label) ?? 0) + 1;

    seen.set(item.label, count);

    return count === 1 ? item : { ...item, label: `${item.label}#${count}` };
  });
}

/**
 * The few figures a leak shows up in, taken once per cycle of whatever is being
 * repeated.
 *
 * Deliberately not a whole `Sample`. A cycle is run several times over, and the
 * process table costs a settle wait each time it is read while saying nothing a
 * leak needs — working set is dominated by allocator behavior that neither
 * grows nor shrinks with what is retained. Nodes and listeners are integers
 * carrying no noise at all, which is what makes them the load-bearing figures
 * here and the heaps the corroborating ones.
 */
export type CycleSample = {
  rendererUsedHeapKb: number;
  /**
   * Blink's own memory, which the JavaScript heap figure does not include.
   * Without it a whole class of leak moves nothing that is compared: an object
   * URL never revoked, a decoded-image or canvas cache that only grows. It costs
   * nothing to carry, being read in the same call as the rest.
   */
  rendererEmbedderHeapKb: number;
  rendererNodes: number;
  rendererListeners: number;
  mainUsedHeapKb: number;
};

export async function takeCycleSample(app: ElectronApplication, page: Page): Promise<CycleSample> {
  await collectGarbage(app, [page]);

  const renderer = await sampleRenderer(app, page);

  const mainUsedHeapKb = await app.evaluate(() => process.getHeapStatistics().usedHeapSize);

  return {
    rendererUsedHeapKb: renderer.usedHeapKb,
    rendererEmbedderHeapKb: renderer.embedderHeapKb,
    rendererNodes: renderer.nodes,
    rendererListeners: renderer.jsEventListeners,
    mainUsedHeapKb,
  };
}

/** Everything worth knowing about the app as it stands right now. */
export async function takeSample(app: ElectronApplication): Promise<Sample> {
  const settleMs = await settle(app);

  const pages = app.windows();

  await collectGarbage(app, pages);

  const { main, processes, webContentsCount, windowCount } = await app.evaluate(
    async ({ app: electronApp, webContents, BrowserWindow }) => {
      /*
       * Built before the metrics are read, because it is the only way back from
       * a pid to what is running in it. Contents whose process has already gone
       * throw rather than answer, and a teardown racing a sample is not worth
       * failing a measurement over.
       */
      const urlsByPid = new Map<number, string[]>();

      const claim = (pid: number, url: string) => {
        urlsByPid.set(pid, [...(urlsByPid.get(pid) ?? []), url]);
      };

      for (const contents of webContents.getAllWebContents()) {
        try {
          const pid = contents.getOSProcessId();

          claim(pid, contents.getURL());

          /*
           * Subframes in a process of their own, which is the only part of the
           * app no `webContents` can name. Ones sharing their contents' process
           * are skipped rather than claimed: the line above already names that
           * process, and a same-origin frame would only repeat its hostname.
           */
          for (const frame of contents.mainFrame.framesInSubtree) {
            if (frame.osProcessId !== pid) {
              claim(frame.osProcessId, frame.url);
            }
          }
        } catch {
          continue;
        }
      }

      // Awaited, unlike the two below it: this one alone answers with a promise,
      // and reading it as a plain object hands the report a NaN.
      const memoryInfo = await process.getProcessMemoryInfo();

      const heap = process.getHeapStatistics();

      const blink = process.getBlinkMemoryInfo();

      return {
        webContentsCount: webContents.getAllWebContents().length,
        windowCount: BrowserWindow.getAllWindows().length,
        main: { memoryInfo, heap, blink },
        processes: electronApp.getAppMetrics().map((metrics) => ({
          type: metrics.type,
          serviceName: metrics.serviceName ?? null,
          pid: metrics.pid,
          workingSetKb: metrics.memory.workingSetSize,
          peakWorkingSetKb: metrics.memory.peakWorkingSetSize,
          cpuSeconds: metrics.cpu.cumulativeCPUUsage ?? 0,
          idleWakeupsPerSecond: metrics.cpu.idleWakeupsPerSecond,
          urls: urlsByPid.get(metrics.pid) ?? [],
        })),
      };
    },
  );

  const labeled = processes.map(({ type, serviceName, urls, ...rest }) => ({
    label: processLabel(type, serviceName, urls),
    type,
    ...rest,
  }));

  const renderers = await Promise.all(pages.map((page) => sampleRenderer(app, page)));

  return {
    settleMs,
    processCount: labeled.length,
    webContentsCount,
    windowCount,
    totalWorkingSetKb: labeled.reduce((total, entry) => total + entry.workingSetKb, 0),
    totalCpuSeconds: Number(
      labeled.reduce((total, entry) => total + entry.cpuSeconds, 0).toFixed(2),
    ),
    main: {
      residentSetKb: main.memoryInfo.residentSet ?? null,
      privateKb: main.memoryInfo.private,
      sharedKb: main.memoryInfo.shared ?? 0,
      usedHeapKb: main.heap.usedHeapSize,
      totalHeapKb: main.heap.totalHeapSize,
      blinkAllocatedKb: main.blink.allocated,
    },
    processes: disambiguate(labeled).sort((left, right) => left.label.localeCompare(right.label)),
    renderers: disambiguate(renderers).sort((left, right) => left.label.localeCompare(right.label)),
  };
}
