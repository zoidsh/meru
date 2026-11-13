import { describe, expect, it } from "vitest";

import { groupSchema } from "./group.ts";
import { layoutSchema, placementSchema } from "./layout.ts";

const leaf = (paneId: string, tabIds = ["t1"]) => ({
  kind: "leaf",
  paneId,
  tabIds,
});

const split = (ratio: number) => ({
  first: leaf("p1"),
  id: "s1",
  kind: "split",
  orientation: "vertical",
  ratio,
  second: leaf("p2"),
});

describe("the layout schema", () => {
  it("parses a nested tree and the empty layout", () => {
    const tree = {
      first: leaf("p1"),
      id: "s1",
      kind: "split",
      orientation: "vertical",
      ratio: 0.5,
      second: {
        first: leaf("p2"),
        id: "s2",
        kind: "split",
        orientation: "horizontal",
        ratio: 0.3,
        second: leaf("p3"),
      },
    };
    expect(layoutSchema.parse(tree)).toStrictEqual(tree);
    expect(layoutSchema.parse(null)).toBeNull();
  });

  it("caps a pane at one tab", () => {
    expect(
      layoutSchema.safeParse(leaf("p1", ["t1", "t2"])).success
    ).toBeFalsy();
    expect(layoutSchema.safeParse(leaf("p1", [])).success).toBeFalsy();
  });

  it("refuses a ratio that leaves a side nothing", () => {
    expect(layoutSchema.safeParse(split(0)).success).toBeFalsy();
    expect(layoutSchema.safeParse(split(1)).success).toBeFalsy();
  });
});

describe("the group schema", () => {
  it("holds its layout", () => {
    const group = {
      id: "g1",
      layout: leaf("p1"),
      profileId: "dev",
      tabIds: ["t1"],
    };
    expect(groupSchema.parse(group)).toStrictEqual(group);
  });
});

describe("the placement schema", () => {
  it("parses a pane of a group with the side it joins on, and refuses an unknown side", () => {
    const placement = {
      groupId: "g1",
      orientation: "horizontal",
      paneId: "p1",
      side: "before",
    };
    expect(placementSchema.parse(placement)).toStrictEqual(placement);
    expect(
      placementSchema.safeParse({ ...placement, side: "above" }).success
    ).toBeFalsy();
  });
});
