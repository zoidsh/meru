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
import { type CycleSample, type Sample, takeCycleSample, takeSample } from "./lib/profile";

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
 * machine, not headroom anyone should grow into. Tighten these when the numbers
 * a real runner produces are known.
 */
const NODE_GROWTH_LIMIT = 20;

const LISTENER_GROWTH_LIMIT = 10;

const RENDERER_HEAP_GROWTH_LIMIT_KB = 1536;

const MAIN_HEAP_GROWTH_LIMIT_KB = 512;

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
    `main resident ${formatKb(sample.main.residentSetKb)}, private ${formatKb(sample.main.privateKb)}, JS heap ${formatKb(sample.main.usedHeapKb)}`,
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

  const growth = {
    nodes: last.rendererNodes - first.rendererNodes,
    listeners: last.rendererListeners - first.rendererListeners,
    rendererHeapKb: last.rendererUsedHeapKb - first.rendererUsedHeapKb,
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

  console.log(
    `[perf] ${MEASURED_CYCLES} measured cycles over ${pageLabels.length} settings pages\n${samples
      .map(
        (sample, cycle) =>
          `  cycle ${cycle + 1}: ${String(sample.rendererNodes).padStart(6)} nodes  ${String(sample.rendererListeners).padStart(6)} listeners  ${formatKb(sample.rendererUsedHeapKb).padStart(9)} renderer heap  ${formatKb(sample.mainUsedHeapKb).padStart(9)} main heap`,
      )
      .join("\n")}\n  growth: ${JSON.stringify(growth)}`,
  );

  // Soft, so one run reports every figure that moved rather than only the first
  // one to trip. Which of them grew is most of the diagnosis: nodes alone is a
  // DOM that is never torn down, listeners alone is a subscription that is never
  // removed, and heap alone is neither.
  expect.soft(growth.nodes, "DOM nodes").toBeLessThanOrEqual(NODE_GROWTH_LIMIT);
  expect.soft(growth.listeners, "JS event listeners").toBeLessThanOrEqual(LISTENER_GROWTH_LIMIT);
  expect
    .soft(growth.rendererHeapKb, "renderer JS heap in KB")
    .toBeLessThanOrEqual(RENDERER_HEAP_GROWTH_LIMIT_KB);
  expect
    .soft(growth.mainHeapKb, "main JS heap in KB")
    .toBeLessThanOrEqual(MAIN_HEAP_GROWTH_LIMIT_KB);
});
