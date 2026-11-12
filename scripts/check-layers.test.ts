import { globSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const app = path.join(import.meta.dirname, "../packages/app");

// Principle 6: core and features load in plain Node with nothing faked. A module that needs Electron, a DOM or a mock of a sibling to import fails here.
const modules = globSync(
  ["core/**/*.{ts,tsx}", "main/features/**/*.{ts,tsx}"],
  {
    cwd: app,
    exclude: (file) => /\.test\.tsx?$/u.test(file),
  }
);

describe("layers", () => {
  it("finds the core modules", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)("imports %s with no mocks", async (file) => {
    await expect(import(path.join(app, file))).resolves.toBeDefined();
  });
});
