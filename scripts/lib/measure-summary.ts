import { z } from "zod";

export type Point = "launch" | "split" | "idle";

export const POINTS: readonly Point[] = ["launch", "split", "idle"];

export type AppName = "meru" | "floor" | "floor-view";

export interface ProcessReading {
  /** Electron's process type: Browser, Tab, GPU, Utility. */
  readonly type: string;
  readonly pid: number;
  /** What the process shows: main, chrome page, a pane by its tab's host, a pane's out-of-process frame by its host, overlay, gpu, a utility by its service. */
  readonly name: string;
  /** Percent of one core since the previous reading. */
  readonly cpu: number;
  /** Electron reports private and shared memory for the main process everywhere, and private for every process on Windows only. */
  readonly privateKB: number | null;
  readonly sharedKB: number | null;
  readonly workingSetKB: number;
  readonly idleWakeups: number | null;
}

export interface Sample {
  readonly point: Point;
  /** One per second, each process's CPU over the second before it. */
  readonly readings: readonly (readonly ProcessReading[])[];
}

export interface Measurement {
  readonly app: AppName;
  readonly commit: string;
  /** The machine measured, since lines are compared only with lines from the same one. */
  readonly host: string;
  readonly platform: string;
  readonly electron: string;
  readonly at: string;
  /** Whether panes showed about:blank rather than their app. */
  readonly blank: boolean;
  readonly samples: readonly Sample[];
}

/** The memory a reading is judged by: private where Electron reports it, else the working set. */
export const memoryOf = (reading: ProcessReading): number =>
  reading.privateKB ?? reading.workingSetKB;

/** A process's kind, the row it is summed into: main, chrome page, pane, pane frame, overlay, gpu, utility, renderer. */
export const kindOf = ({ type, name }: ProcessReading): string => {
  if (type === "Browser") {
    return "main";
  }
  if (type === "GPU") {
    return "gpu";
  }
  if (type === "Utility") {
    return "utility";
  }
  const named = ["chrome page", "pane frame", "pane", "overlay"].find((kind) =>
    name.startsWith(kind)
  );
  return named ?? "renderer";
};

export interface Row {
  readonly kind: string;
  /** Per point: the largest memory of any process of the kind in any reading, in KB, and the mean CPU across its readings. */
  readonly points: Readonly<
    Partial<Record<Point, { readonly memoryKB: number; readonly cpu: number }>>
  >;
}

const mean = (values: readonly number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const summarise = (measurement: Measurement): Row[] => {
  const kinds = new Map<string, Map<Point, ProcessReading[][]>>();
  for (const { point, readings } of measurement.samples) {
    for (const reading of readings) {
      const byKind = new Map<string, ProcessReading[]>();
      for (const process of reading) {
        const kind = kindOf(process);
        byKind.set(kind, [...(byKind.get(kind) ?? []), process]);
      }
      for (const [kind, processes] of byKind) {
        const points = kinds.get(kind) ?? new Map<Point, ProcessReading[][]>();
        points.set(point, [...(points.get(point) ?? []), processes]);
        kinds.set(kind, points);
      }
    }
  }
  return [...kinds].map(([kind, points]) => ({
    kind,
    points: Object.fromEntries(
      [...points].map(([point, readings]) => [
        point,
        {
          // CPU of a kind in one reading is the sum over its processes; the row shows the mean of those sums.
          cpu: mean(
            readings.map((processes) =>
              processes.reduce((sum, process) => sum + process.cpu, 0)
            )
          ),
          memoryKB: Math.max(...readings.flat().map(memoryOf)),
        },
      ])
    ),
  }));
};

const mb = (kb: number) => (kb / 1024).toFixed(1);

const cell = (row: Row | undefined, point: Point) => {
  const found = row?.points[point];
  return found === undefined
    ? "-"
    : `${mb(found.memoryKB)} MB ${found.cpu.toFixed(1)}%`;
};

/** A plain table per kind and point, Meru's numbers beside the floor's when there is one. */
export const table = (meru: Measurement, floor?: Measurement): string => {
  const ours = summarise(meru);
  const theirs = floor === undefined ? [] : summarise(floor);
  const headings = [
    "kind",
    ...POINTS.flatMap((point) =>
      floor === undefined ? [point] : [point, `${point} ${floor.app}`]
    ),
  ];
  const kinds = [...new Set([...ours, ...theirs].map((row) => row.kind))];
  const rows = kinds.map((kind) => {
    const mine = ours.find((row) => row.kind === kind);
    const base = theirs.find((row) => row.kind === kind);
    return [
      kind,
      ...POINTS.flatMap((point) =>
        floor === undefined
          ? [cell(mine, point)]
          : [cell(mine, point), cell(base, point)]
      ),
    ];
  });
  const widths = headings.map((heading, column) =>
    Math.max(heading.length, ...rows.map((row) => row[column]?.length ?? 0))
  );
  return [headings, ...rows]
    .map((row) =>
      row
        .map((text, column) => text.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
};

export interface Budget {
  /** Percent of one core any process may use, as the mean of its idle readings. */
  readonly idleCpu: number;
  /** KB the main process and the chrome page may grow between launch and idle. */
  readonly growthKB: number;
}

/** Everything in a measurement over budget, one line each; empty when it is within. */
export const overBudget = (
  measurement: Measurement,
  budget: Budget
): string[] => {
  const at = (point: Point) =>
    measurement.samples.find((sample) => sample.point === point)?.readings ??
    [];
  const idle = at("idle").flat();
  const cpu = [...new Set(idle.map((process) => process.pid))].flatMap(
    (pid) => {
      const readings = idle.filter((process) => process.pid === pid);
      const used = mean(readings.map((process) => process.cpu));
      const name = readings[0]?.name ?? String(pid);
      return used > budget.idleCpu
        ? [`${name} used ${used.toFixed(1)}% CPU at idle`]
        : [];
    }
  );
  const largest = (point: Point, kind: string) =>
    Math.max(
      0,
      ...at(point)
        .flat()
        .filter((process) => kindOf(process) === kind)
        .map(memoryOf)
    );
  const growth = ["main", "chrome page"].flatMap((kind) => {
    const grew = largest("idle", kind) - largest("launch", kind);
    return grew > budget.growthKB
      ? [`${kind} grew ${mb(grew)} MB from launch to idle`]
      : [];
  });
  return [...cpu, ...growth];
};

const firstLineSchema = z.object({ host: z.string() });

/** The host a measurements file records: the override if given, else its first line's, else none yet, so the first run sets it. */
export const recordingHost = (
  text: string,
  override: string | undefined
): string | undefined => {
  if (override !== undefined && override !== "") {
    return override;
  }
  const first = text.split("\n").find(Boolean);
  if (first === undefined) {
    return undefined;
  }
  const parsed = firstLineSchema.safeParse(JSON.parse(first));
  if (!parsed.success) {
    throw new Error("The first line of the measurements file has no host");
  }
  return parsed.data.host;
};
