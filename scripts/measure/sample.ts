import type { ProcessType } from "./processes.ts";
import type { Metrics } from "./report.ts";

/** A page main reported, from a web contents or one of its frames. */
interface PageInProcess {
  pid: number;
  /** Chromium's own id for the process, which a service worker reports. */
  processId: number;
  url: string;
  isSubframe: boolean;
}

/** A running service worker, which main names by Chromium's id alone. */
interface WorkerInProcess {
  processId: number;
  scope: string;
}

export interface RendererPages {
  pages: readonly PageInProcess[];
  workers: readonly WorkerInProcess[];
  rendererPids: readonly number[];
}

const NAMED_HOSTS: Record<string, string> = {
  "mail.google.com": "Gmail",
  "calendar.google.com": "Calendar",
};

const nameOfUrl = (url: string) => {
  try {
    const { protocol, host } = new URL(url);

    if (protocol === "meru-app:") {
      return "shell";
    }

    return NAMED_HOSTS[host] ?? host;
  } catch {
    return "";
  }
};

const joinSorted = (values: Iterable<string>) =>
  [...new Set(values)].toSorted().join(", ");

/**
 * Names each renderer by what it shows: the first web contents in it, or,
 * for a process holding only frames, the frames' hosts. An `about:blank`, such
 * as the overlay drawn from the shell's process, names nothing. A renderer no
 * page is in holds service workers when one runs outside every page's
 * process; main gives a worker's Chromium id and no OS pid, so with several
 * such renderers each is named after all of their workers.
 */
export const nameRenderers = ({
  pages,
  workers,
  rendererPids,
}: RendererPages) => {
  const names = new Map<number, string>();
  const frameHosts = new Map<number, string[]>();

  for (const page of pages) {
    const name = nameOfUrl(page.url);

    if (!name) {
      continue;
    }

    if (page.isSubframe) {
      frameHosts.set(page.pid, [...(frameHosts.get(page.pid) ?? []), name]);
    } else if (!names.has(page.pid)) {
      names.set(page.pid, name);
    }
  }

  for (const [pid, hosts] of frameHosts) {
    if (!names.has(pid)) {
      names.set(pid, `frames ${joinSorted(hosts)}`);
    }
  }

  const pageProcessIds = new Set(pages.map((page) => page.processId));
  const workerHosts = joinSorted(
    workers
      .filter((worker) => !pageProcessIds.has(worker.processId))
      .map((worker) => nameOfUrl(worker.scope))
  );

  if (workerHosts) {
    for (const pid of rendererPids.filter(
      (candidate) => !names.has(candidate)
    )) {
      names.set(pid, `service worker ${workerHosts}`);
    }
  }

  return names;
};

interface SampledProcess {
  pid: number;
  type: ProcessType;
  /** What a renderer shows, when main could say. */
  name?: string;
  footprintBytes: number;
}

export interface RunSample {
  windowShownMs: number;
  inboxUsableMs: number;
  /** CPU over the idle window, as a percentage of one core. */
  idleCpuPercent: number;
  processes: SampledProcess[];
  /** footprint's total, counting what the processes share once. */
  sharedOnceBytes: number;
}

const MB = 1024 * 1024;

const rowOf = (process: SampledProcess) => {
  switch (process.type.kind) {
    case "browser": {
      return "browser";
    }
    case "gpu": {
      return "GPU";
    }
    case "network": {
      return "network";
    }
    case "renderer": {
      return `renderer: ${process.name ?? "unnamed"}`;
    }
    default: {
      return `helper ${process.type.detail ?? "unknown"}`;
    }
  }
};

/**
 * A run's figures by metric. Memory is in MB of 2^20 bytes. Two renderers of
 * one name, such as two Gmail views, are told apart by a count, larger first.
 */
export const metricsOf = (sample: RunSample): Metrics => {
  const memory = new Map<string, number[]>();

  for (const process of sample.processes) {
    const row = rowOf(process);

    memory.set(row, [...(memory.get(row) ?? []), process.footprintBytes / MB]);
  }

  const metrics: Metrics = {};

  for (const [row, values] of memory) {
    if (row.startsWith("renderer: ")) {
      for (const [index, value] of values.toSorted((a, b) => b - a).entries()) {
        metrics[`memory ${index === 0 ? row : `${row} #${index + 1}`}`] = value;
      }
    } else {
      metrics[`memory ${row}`] = values.reduce((sum, value) => sum + value, 0);
    }
  }

  metrics["memory total"] = sample.processes.reduce(
    (sum, process) => sum + process.footprintBytes / MB,
    0
  );
  metrics["memory total, shared once"] = sample.sharedOnceBytes / MB;
  metrics.processes = sample.processes.length;
  metrics["idle CPU %"] = sample.idleCpuPercent;
  metrics["window shown ms"] = sample.windowShownMs;
  metrics["inbox usable ms"] = sample.inboxUsableMs;

  return metrics;
};
