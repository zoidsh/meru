import { describe, expect, it } from "vitest";

import { parseFootprintJson } from "./footprint.ts";

// Trimmed from `footprint --noCategories -f bytes -j` on macOS 27.2.
const OUTPUT = JSON.stringify({
  unit: "byte",
  "bytes per unit": 1,
  processes: [
    {
      name: "Electron",
      pid: 700,
      "page size": 16_384,
      footprint: 56_934_400,
      auxiliary: { phys_footprint: 56_934_400 },
    },
    {
      name: "Electron Helper (GPU)",
      pid: 701,
      "page size": 16_384,
      footprint: 41_205_760,
      auxiliary: { phys_footprint: 41_205_760 },
    },
  ],
  errors: [],
  "total footprint": 96_000_000,
  shared: [],
});

describe(parseFootprintJson, () => {
  it("reads each process's footprint and footprint's own total", () => {
    const { byPid, total } = parseFootprintJson(OUTPUT);

    expect([...byPid]).toStrictEqual([
      [700, 56_934_400],
      [701, 41_205_760],
    ]);
    expect(total).toBe(96_000_000);
  });

  it("adds the processes up when there is no total, and skips a broken entry", () => {
    const { byPid, total } = parseFootprintJson(
      JSON.stringify({
        processes: [
          { pid: 1, footprint: 10 },
          { pid: 2, footprint: 5 },
          { pid: "3", footprint: 7 },
        ],
      })
    );

    expect(byPid.size).toBe(2);
    expect(total).toBe(15);
  });
});
