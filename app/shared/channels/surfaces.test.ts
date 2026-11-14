import { describe, expect, it } from "vitest";

import { allowlist, wireName } from "./define.ts";
import { stage } from "./stage.ts";
import {
  chromeSurface,
  launcherSurface,
  surfaceArgument,
  surfaceOf,
} from "./surfaces.ts";

const argv = (...extra: string[]) => [
  "/path/to/electron",
  "--type=renderer",
  ...extra,
];

describe(surfaceOf, () => {
  it("gives a page the surface its argument names", () => {
    expect([
      surfaceOf(argv(surfaceArgument("chrome"))),
      surfaceOf(argv(surfaceArgument("launcher"))),
    ]).toStrictEqual([chromeSurface, launcherSurface]);
  });

  it("allows nothing to a page named nothing or a name it does not know", () => {
    const allowed = [
      surfaceOf(argv()),
      surfaceOf(argv("--meru-surface=test")),
      surfaceOf(argv("--meru-surface=")),
    ].map((surface) => {
      const list = allowlist(surface);
      return [...list.event, ...list.invoke, ...list.sync, ...list.push];
    });
    expect(allowed).toStrictEqual([[], [], []]);
  });

  it("allows, for several surfaces, what any of them allows", () => {
    const list = allowlist(launcherSurface, chromeSurface);
    expect([
      list.invoke.has(wireName(stage.openTab)),
      list.sync.has(wireName(stage.snapshot)),
    ]).toStrictEqual([true, true]);
  });

  it("allows the launcher's page to open a tab but not to read the stage", () => {
    const list = allowlist(surfaceOf(argv(surfaceArgument("launcher"))));
    expect([
      list.invoke.has(wireName(stage.openTab)),
      list.sync.has(wireName(stage.snapshot)),
    ]).toStrictEqual([true, false]);
  });
});
