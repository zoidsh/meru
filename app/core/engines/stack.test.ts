import { describe, expect, it } from "vitest";

import { stackOf, stackPlan } from "./stack.ts";
import type { StackOperation } from "./stack.ts";

// Electron's addChildView, which moves a view already attached to the top whatever the index.
const apply = (children: readonly string[], plan: StackOperation<string>[]) => {
  let result = [...children];
  for (const operation of plan) {
    if (operation.kind === "remove") {
      result = result.filter((view) => view !== operation.view);
    } else if (result.includes(operation.view)) {
      result = [
        ...result.filter((view) => view !== operation.view),
        operation.view,
      ];
    } else {
      result = result.toSpliced(operation.index, 0, operation.view);
    }
  }
  return result;
};

describe(stackOf, () => {
  it("stacks the panes in layout order, the overlays above, and a fullscreen pane on top", () => {
    expect([
      stackOf(["a", "b"], ["drag"]),
      stackOf(["a", "b"], ["drag"], "a"),
    ]).toStrictEqual([
      ["a", "b", "drag"],
      ["b", "drag", "a"],
    ]);
  });
});

describe(stackPlan, () => {
  it("does nothing when the views are in place", () => {
    expect(stackPlan(["a", "b"], ["a", "b"])).toStrictEqual([]);
  });

  it("adds a new view at its index and removes one that went", () => {
    const plan = stackPlan(["a", "gone"], ["a", "b", "drag"]);
    expect(plan).toStrictEqual([
      { kind: "remove", view: "gone" },
      { index: 1, kind: "add", view: "b" },
      { index: 2, kind: "add", view: "drag" },
    ]);
    expect(apply(["a", "gone"], plan)).toStrictEqual(["a", "b", "drag"]);
  });

  it("moves a view by removing it and inserting it again", () => {
    const plan = stackPlan(["a", "b"], ["b", "a"]);
    expect(plan).toStrictEqual([
      { kind: "remove", view: "b" },
      { index: 0, kind: "add", view: "b" },
    ]);
    expect(apply(["a", "b"], plan)).toStrictEqual(["b", "a"]);
  });

  it("reaches any order Electron's semantics allow", () => {
    const current = ["a", "b", "c", "d"];
    const wanted = ["d", "b", "e", "a"];
    expect(apply(current, stackPlan(current, wanted))).toStrictEqual(wanted);
  });
});
