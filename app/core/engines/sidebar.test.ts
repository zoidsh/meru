import { describe, expect, it } from "vitest";

import type { Tab } from "../records/tab.ts";
import { sidebarInset, sidebarOf } from "./sidebar.ts";
import type { SidebarChoice } from "./sidebar.ts";

const tab = (appId: string, pinned = false): Tab => ({
  appId,
  health: "ok",
  id: `${appId}-${Math.random()}`,
  pinned,
  profileId: "p",
  sleeping: false,
  title: appId,
  url: "https://example.com/",
  zoom: 1,
});

const auto: SidebarChoice = { flipped: null, hidden: false, width: "auto" };

describe(sidebarOf, () => {
  it("hides the strip with one tab or none, and when the user hid it", () => {
    expect(sidebarOf([tab("gmail")], auto)).toStrictEqual({ kind: "hidden" });
    expect(sidebarOf([], auto)).toStrictEqual({ kind: "hidden" });
    expect(
      sidebarOf([tab("gmail"), tab("calendar")], { ...auto, hidden: true })
    ).toStrictEqual({ kind: "hidden" });
  });

  it("is narrow under auto while every app has one tab, and wide once one has several", () => {
    expect(sidebarOf([tab("gmail"), tab("calendar")], auto)).toStrictEqual({
      kind: "shown",
      size: "narrow",
      width: 64,
    });
    expect(
      sidebarOf([tab("gmail"), tab("drive"), tab("drive")], auto)
    ).toStrictEqual({ kind: "shown", size: "wide", width: 224 });
  });

  it("counts no pinned tab towards wide, as 3.x did", () => {
    expect(
      sidebarOf([tab("gmail"), tab("drive", true), tab("drive")], auto)
    ).toMatchObject({ size: "narrow" });
  });

  it("takes the width the user set, and over it the one they flipped to", () => {
    const two = [tab("gmail"), tab("drive"), tab("drive")];
    expect(sidebarOf(two, { ...auto, width: "narrow" })).toMatchObject({
      size: "narrow",
    });
    expect(
      sidebarOf(two, { ...auto, flipped: "wide", width: "narrow" })
    ).toMatchObject({ size: "wide" });
  });
});

describe(sidebarInset, () => {
  it("takes the strip's width, or nothing while it is hidden", () => {
    expect(sidebarInset({ kind: "hidden" })).toBe(0);
    expect(sidebarInset({ kind: "shown", size: "wide", width: 224 })).toBe(224);
  });
});
