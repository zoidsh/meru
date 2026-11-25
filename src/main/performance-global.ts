import { performance } from "node:perf_hooks";

/**
 * Sets `performance` on `target` to perf_hooks' own. Node's lazy global keeps
 * the perf_hooks exports it first read; read while perf_hooks is still
 * loading, as an inspector client's evaluation can at any moment, it answers
 * undefined for good, and undici, which Electron's protocol handler loads for
 * its `Request`, then throws as it loads, so the shell's first page fails.
 */
export const restorePerformanceGlobal = (target: { performance?: unknown }) => {
  target.performance = performance;
};
