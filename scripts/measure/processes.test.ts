import { describe, expect, it } from "vitest";

import { parseCpuTime, parsePs, processTypeOf, treeOf } from "./processes.ts";

const HELPER = "/Applications/Meru.app/Contents/Frameworks/Meru Helper.app";

const PS = `    1     0   1:02.50 /sbin/launchd
  700     1   0:03.25 /Applications/Meru.app/Contents/MacOS/Meru --user-data-dir=/tmp/a b
  701   700   0:01.00 ${HELPER} --type=gpu-process --user-data-dir=/tmp/a b
  702   700   0:00.50 ${HELPER} --type=utility --utility-sub-type=network.mojom.NetworkService
  703   700   0:00.10 ${HELPER} --type=utility --utility-sub-type=storage.mojom.StorageService
  704   700 1:00:00.00 ${HELPER} --type=renderer --renderer-client-id=5
  705   704   0:00.00 /usr/bin/some-grandchild
  900     1   0:00.01 /bin/zsh`;

describe(parseCpuTime, () => {
  it("reads minutes, hours and days", () => {
    expect(parseCpuTime("0:03.25")).toBeCloseTo(3.25);
    expect(parseCpuTime("2:00.50")).toBeCloseTo(120.5);
    expect(parseCpuTime("1:00:00.00")).toBe(3600);
    expect(parseCpuTime("2-01:00:00.00")).toBe(2 * 86_400 + 3600);
  });
});

describe(parsePs, () => {
  it("keeps a command's spaces and skips lines that are not rows", () => {
    const entries = parsePs(`${PS}\n\n  garbage`);

    expect(entries).toHaveLength(8);
    expect(entries[1]).toStrictEqual({
      pid: 700,
      ppid: 1,
      cpuSeconds: 3.25,
      command:
        "/Applications/Meru.app/Contents/MacOS/Meru --user-data-dir=/tmp/a b",
    });
  });
});

describe(treeOf, () => {
  it("takes the root and every descendant, and nothing else", () => {
    const pids = treeOf(parsePs(PS), 700).map((entry) => entry.pid);

    expect(pids.toSorted()).toStrictEqual([700, 701, 702, 703, 704, 705]);
  });

  it("is empty once the root has gone", () => {
    expect(treeOf(parsePs(PS), 12_345)).toStrictEqual([]);
  });
});

describe(processTypeOf, () => {
  it("tells Chromium's processes apart by their switches", () => {
    const types = Object.fromEntries(
      treeOf(parsePs(PS), 700).map((entry) => [
        entry.pid,
        processTypeOf(entry, 700),
      ])
    );

    expect(types).toStrictEqual({
      700: { kind: "browser" },
      701: { kind: "gpu" },
      702: { kind: "network" },
      703: { kind: "utility", detail: "storage" },
      704: { kind: "renderer" },
      705: { kind: "other", detail: "unknown" },
    });
  });
});
