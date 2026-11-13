import { globSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const app = path.join(import.meta.dirname, "../app");

const modules = globSync(
  ["core/**/*.{ts,tsx}", "main/features/**/*.{ts,tsx}"],
  {
    cwd: app,
    exclude: (file) => /\.test\.tsx?$/u.test(file),
  }
);

describe("core and features", () => {
  it("finds the core modules", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)(
    "imports %s in plain Node with nothing faked",
    async (file) => {
      await expect(import(path.join(app, file))).resolves.toBeDefined();
    }
  );
});
