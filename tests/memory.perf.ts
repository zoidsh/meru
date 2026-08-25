/*
 * What the app costs to run, and whether repeating something makes it cost more.
 *
 * Two tests with deliberately different standing. The cold-launch snapshot
 * reports and never fails: its figures are absolute, and an absolute figure
 * belongs to the machine that produced it, so a threshold set from one machine
 * says nothing on another. The leak check fails, because it compares a run to
 * itself — the same app, the same machine, the same minute — and growth across
 * cycles means the same thing everywhere.
 *
 * What is not covered, and cannot be: no Gmail account signs in. The audit's
 * argument is that the dominant cost is Gmail's own document and heap in a view
 * per account, and none of that is here. What is here is the shell — main, the
 * GPU and network processes, Meru's own renderer — plus one signed-out Gmail
 * view, which is more than nothing: the Gmail preload evaluates before its
 * hostname check, so everything it drags in is loaded and measured on the
 * sign-in page too.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import {
  type CycleGrowth,
  type CycleSample,
  type Sample,
  takeCycleSample,
  takeSample,
} from "./lib/profile";
import { recordSection } from "./lib/report";

const meru = useApp({}, { profile: true });

/**
 * Discarded rather than measured. A first pass through a route allocates things
 * it then keeps on purpose — compiled code, caches, a route's module — and
 * counting that as growth would report a leak in every app ever written.
 */
const WARMUP_CYCLES = 2;

const MEASURED_CYCLES = 5;

/*
 * How much the measured cycles may grow before this is called a leak.
 *
 * Every figure below is set against what this actually does at rest, measured
 * over repeated runs on one machine rather than guessed at. Across five
 * measured cycles of nineteen settings pages: nodes moved between -3 and 0,
 * listeners did not move at all, the renderer heap grew about 520 KB, and the
 * main heap about 52 KB. Three runs agreed to within a few kilobytes.
 *
 * The renderer heap growth is real and reproducible, and it is not a leak. Run
 * out to twenty cycles it decelerates and flattens — 9.8 MB, 10.3 MB at cycle
 * five, 11.4 MB at cycle twenty and unmoving from cycle fifteen — which is what
 * caches filling looks like, where a leak keeps a straight line. That is also
 * why the heap figures are the corroborating evidence here and the counts are
 * the load-bearing ones: a leak that plateaus is not a leak, and only counts
 * say so cleanly.
 *
 * The room left over each figure is deliberate slack for a slower or busier
 * machine, not headroom anyone should grow into. Tighten these when a runner's
 * own spread over repeated runs is known — hosted runners report figures close
 * to these, but runs agreeing with each other is not the same as knowing how
 * far one of them can wander.
 */
const NODE_GROWTH_LIMIT = 20;

const LISTENER_GROWTH_LIMIT = 10;

const RENDERER_HEAP_GROWTH_LIMIT_KB = 1536;

/**
 * Blink's own memory sits flat where the JavaScript heap climbs — between 2.1
 * and 2.2 MB across the same cycles, ending 153 KB below where it started — so
 * it gets a smaller limit rather than the JavaScript heap's slack.
 *
 * What it reads is `embedderHeapUsedSize`, which is Oilpan, the garbage-collected
 * heap Blink allocates its own C++ objects in. So it is retention on that heap
 * this catches and nothing else: a detached DOM tree held alive by a C++
 * reference is the case worth having, because the node count cannot see one
 * that JavaScript no longer points at. It is not a general second opinion on
 * renderer memory — a blob whose object URL is never revoked keeps its payload
 * in the browser process, and a decoded-image cache lives in Skia's discardable
 * memory, so neither moves this figure. Both would show up in the working set,
 * which these cycles deliberately do not read.
 */
const RENDERER_EMBEDDER_HEAP_GROWTH_LIMIT_KB = 512;

const MAIN_HEAP_GROWTH_LIMIT_KB = 512;

/*
 * What this scenario cannot reach, distinct from what the file header says about
 * signing in: no view and no window is created or destroyed here, so the audit's
 * own leak findings — the account-removal cluster at 2.1 to 2.3, and tab detach
 * at 2.8 — are not exercisable by navigating settings. They need a scenario that
 * adds and removes accounts, and that is its own piece of work.
 */

function formatKb(kilobytes: number) {
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

/**
 * The report as someone reads it, printed as well as attached. A job killed for
 * running long never uploads its artifacts, and the log is what survives that.
 */
function formatSample(sample: Sample) {
  const lines = [
    `settled after ${sample.settleMs} ms`,
    `${sample.processCount} processes, ${sample.webContentsCount} webContents, ${sample.windowCount} window(s)`,
    `total working set ${formatKb(sample.totalWorkingSetKb)}, total CPU ${sample.totalCpuSeconds.toFixed(2)}s`,
    "",
    "process                                    working set      CPU   wakeups/s",
  ];

  for (const entry of sample.processes) {
    lines.push(
      `${entry.label.padEnd(42)}${formatKb(entry.workingSetKb).padStart(11)}${`${entry.cpuSeconds.toFixed(2)}s`.padStart(9)}${String(entry.idleWakeupsPerSecond).padStart(12)}`,
    );
  }

  lines.push(
    "",
    "renderer                                      JS heap      DOM     nodes   listeners",
  );

  for (const entry of sample.renderers) {
    lines.push(
      `${entry.label.padEnd(42)}${formatKb(entry.usedHeapKb).padStart(11)}${formatKb(entry.embedderHeapKb).padStart(9)}${String(entry.nodes).padStart(10)}${String(entry.jsEventListeners).padStart(12)}`,
    );
  }

  lines.push(
    "",
    // Resident is left out rather than shown as zero where the platform does not
    // report it, which is macOS. A zero in a memory report reads as a broken
    // reading, and someone would go looking for the break.
    [
      sample.main.residentSetKb === null
        ? null
        : `main resident ${formatKb(sample.main.residentSetKb)}`,
      `private ${formatKb(sample.main.privateKb)}`,
      `JS heap ${formatKb(sample.main.usedHeapKb)}`,
    ]
      .filter(Boolean)
      .join(", "),
  );

  return lines.join("\n");
}

// oxlint-disable-next-line no-empty-pattern
test("cold launch", async ({}, testInfo) => {
  const sample = await takeSample(meru.app);

  await testInfo.attach("cold-launch", {
    body: JSON.stringify({ platform: process.platform, ...sample }, null, 2),
    contentType: "application/json",
  });

  await recordSection("coldLaunch", sample);

  console.log(`[perf] cold launch on ${process.platform}\n${formatSample(sample)}`);

  /*
   * The only assertions here guard the measurement rather than the app. A
   * sample that found one process, or a renderer with an empty heap, is one
   * where the reading went wrong — and a report of zeroes that passes quietly
   * is worse than no report at all.
   */
  expect(sample.processCount).toBeGreaterThan(1);
  expect(sample.renderers.length).toBeGreaterThan(0);
  expect(sample.main.usedHeapKb).toBeGreaterThan(0);
  expect(sample.totalWorkingSetKb).toBeGreaterThan(0);

  /*
   * Also the CPU column, because `cumulativeCPUUsage` is optional in Electron's
   * types and carries no note about which platforms answer it. Where it is
   * missing every reading defaults to zero, every interval looks quiet, and
   * `settle` quietly stops being a wait for the app to go idle and becomes a
   * two-second sleep. Nothing else would say so: the report would be a column
   * of 0.00s that nobody has a reason to disbelieve.
   */
  expect(
    sample.totalCpuSeconds,
    "no CPU was reported, so settling degraded to a fixed sleep",
  ).toBeGreaterThan(0);
});

// oxlint-disable-next-line no-empty-pattern
test("navigating settings repeatedly does not leak", async ({}, testInfo) => {
  const navigation = await meru.openSettings();

  /*
   * Read from the sidebar rather than listed here, for the reason the
   * end-to-end settings walk gives: a list kept here is a copy of the app's own
   * that nothing keeps in step, and a page added to the app would simply never
   * be cycled.
   */
  const pageLabels = await navigation.getByRole("button").allInnerTexts();

  expect(pageLabels.length).toBeGreaterThan(5);

  const samples: CycleSample[] = [];

  for (let cycle = 0; cycle < WARMUP_CYCLES + MEASURED_CYCLES; cycle++) {
    for (const label of pageLabels) {
      await navigation.getByRole("button", { name: label, exact: true }).click();

      // Waited for, not clicked past. Racing ahead would leave the cycles
      // measuring how fast the machine is rather than what the app retains.
      await expect(meru.renderer.getByTestId("settings-title")).toContainText(label);
    }

    if (cycle >= WARMUP_CYCLES) {
      samples.push(await takeCycleSample(meru.app, meru.renderer));
    }
  }

  const first = samples[0] as CycleSample;

  const last = samples[samples.length - 1] as CycleSample;

  const growth: CycleGrowth = {
    nodes: last.rendererNodes - first.rendererNodes,
    listeners: last.rendererListeners - first.rendererListeners,
    rendererHeapKb: last.rendererUsedHeapKb - first.rendererUsedHeapKb,
    rendererEmbedderHeapKb: last.rendererEmbedderHeapKb - first.rendererEmbedderHeapKb,
    mainHeapKb: last.mainUsedHeapKb - first.mainUsedHeapKb,
  };

  await testInfo.attach("settings-cycles", {
    body: JSON.stringify(
      { platform: process.platform, pages: pageLabels.length, samples, growth },
      null,
      2,
    ),
    contentType: "application/json",
  });

  await recordSection("settingsCycles", { pages: pageLabels.length, samples, growth });

  console.log(
    `[perf] ${MEASURED_CYCLES} measured cycles over ${pageLabels.length} settings pages\n${samples
      .map(
        (sample, cycle) =>
          `  cycle ${cycle + 1}: ${String(sample.rendererNodes).padStart(6)} nodes  ${String(sample.rendererListeners).padStart(6)} listeners  ${formatKb(sample.rendererUsedHeapKb).padStart(9)} JS heap  ${formatKb(sample.rendererEmbedderHeapKb).padStart(9)} Blink  ${formatKb(sample.mainUsedHeapKb).padStart(9)} main heap`,
      )
      .join("\n")}\n  growth: ${JSON.stringify(growth)}`,
  );

  /*
   * Soft, so one run reports every figure that moved rather than only the first
   * one to trip. Which of them grew is most of the diagnosis: nodes alone is a
   * DOM that is never torn down, listeners alone is a subscription that is never
   * removed, and heap alone is neither.
   *
   * The counts are asserted on every platform. They are counted rather than
   * sampled, so there is nothing in them for a machine to be different about,
   * and a leak that moves them means the same thing wherever it is seen.
   */
  expect.soft(growth.nodes, "DOM nodes").toBeLessThanOrEqual(NODE_GROWTH_LIMIT);
  expect.soft(growth.listeners, "JS event listeners").toBeLessThanOrEqual(LISTENER_GROWTH_LIMIT);

  /*
   * The Blink reading, before it is compared to anything. `embedderHeapUsedSize`
   * is absent from Electron's type for the heap usage response and read through
   * a cast, so a rename or a removal in some future Chromium reaches this file
   * as zero rather than as an error. Every sample would then read zero, growth
   * would be zero, and the limit below would pass forever on a figure nobody was
   * measuring — and it is the one figure where that failure is invisible, since
   * a healthy Blink heap shrinks across these cycles and a broken reading sits
   * at zero, both comfortably under an upper bound. This is the same guard the
   * cold-launch test puts on its own figures, for the same reason.
   */
  expect(
    first.rendererEmbedderHeapKb,
    "no Blink heap was reported, so its limit is guarding nothing",
  ).toBeGreaterThan(0);

  /*
   * The heaps are asserted everywhere too, which they were not at first.
   *
   * Their limits come from how caches fill on one Linux machine, and until a
   * hosted macOS or Windows runner had been watched doing the same, a limit
   * merely wrong there would have turned an unrelated pull request red — this
   * test gates a required job with no retry. So they reported on those
   * platforms and gated on Linux alone. CI retired that: over five cycles the
   * renderer JS heap grew between 513 and 601 KB across the three, the Blink
   * heap shrank on all of them, and the main heap moved between 43 and 58 KB.
   * Every figure sits inside its limit with room to spare — the renderer heap,
   * the closest, at about two fifths of it.
   *
   * The limits stay where they are. A tighter one would have to be set against
   * a platform's own spread over repeated runs, and two runs agreeing within
   * 10 KB apiece is two points, not a spread. The threat to a tight limit is
   * not run-to-run wander anyway but a step change — an Electron upgrade or a
   * new runner image moving cache-fill behavior wholesale — which no spread
   * data predicts and slack absorbs.
   */
  expect
    .soft(growth.rendererHeapKb, "renderer JS heap in KB")
    .toBeLessThanOrEqual(RENDERER_HEAP_GROWTH_LIMIT_KB);
  expect
    .soft(growth.rendererEmbedderHeapKb, "renderer Blink heap in KB")
    .toBeLessThanOrEqual(RENDERER_EMBEDDER_HEAP_GROWTH_LIMIT_KB);
  expect
    .soft(growth.mainHeapKb, "main JS heap in KB")
    .toBeLessThanOrEqual(MAIN_HEAP_GROWTH_LIMIT_KB);
});
