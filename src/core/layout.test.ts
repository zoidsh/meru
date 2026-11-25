import { describe, expect, it } from "vitest";

import { contentViewBounds, viewFrame } from "./layout.ts";
import { titlebarStart } from "./titlebar.ts";

const WINDOW = { width: 1280, height: 800 };

describe(contentViewBounds, () => {
  it("sits flush below the 40px titlebar and beside the sidebar, 8px from the window's right edge and its bottom", () => {
    expect([
      contentViewBounds(
        WINDOW,
        { sidebar: "narrow", trialFooter: false },
        "linux"
      ),
      contentViewBounds(
        WINDOW,
        { sidebar: "wide", trialFooter: false },
        "linux"
      ),
    ]).toStrictEqual([
      { x: 64, y: 40, width: 1208, height: 752 },
      { x: 224, y: 40, width: 1048, height: 752 },
    ]);
  });

  it("starts at the sidebar toggle's left edge while the sidebar is narrow", () => {
    expect(
      (["darwin", "win32", "linux"] as const).map(
        (platform) =>
          contentViewBounds(
            WINDOW,
            { sidebar: "narrow", trialFooter: false },
            platform
          ).x
      )
    ).toStrictEqual([titlebarStart("darwin"), 64, 64]);
  });

  it("keeps 8px from the window's left edge too while the sidebar is hidden", () => {
    expect(
      contentViewBounds(
        WINDOW,
        { sidebar: "hidden", trialFooter: false },
        "darwin"
      )
    ).toStrictEqual({
      x: 8,
      y: 40,
      width: 1264,
      height: 752,
    });
  });

  it("never gives a negative size", () => {
    const bounds = contentViewBounds(
      { width: 100, height: 30 },
      { sidebar: "wide", trialFooter: false },
      "darwin"
    );

    expect([bounds.width, bounds.height]).toStrictEqual([0, 0]);
  });
});

describe(viewFrame, () => {
  it("leaves no inset toward the trial footer, which takes the titlebar's height below the page", () => {
    const frame = { sidebar: "narrow", trialFooter: true } as const;

    expect([
      viewFrame(frame).inset.bottom,
      contentViewBounds(WINDOW, frame, "linux"),
    ]).toStrictEqual([0, { x: 64, y: 40, width: 1208, height: 720 }]);
  });

  it("rounds the view's corners by 8px", () => {
    expect(viewFrame({ sidebar: "wide", trialFooter: false }).radius).toBe(8);
  });
});
