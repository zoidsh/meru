import { describe, expect, it } from "vitest";

import { leaf } from "./layout.ts";
import {
  afterClose,
  afterFocus,
  afterFullscreen,
  fullscreenPaneOf,
  NO_SPOTLIGHT,
  toggleMaximised,
} from "./spotlight.ts";

const both = { fullscreen: "video", maximised: "mail" };

describe(toggleMaximised, () => {
  it("maximises the focused tab's pane, and shows every pane again while one is", () => {
    const maximised = toggleMaximised(NO_SPOTLIGHT, "mail", 2);
    expect([
      maximised,
      toggleMaximised({ ...NO_SPOTLIGHT, maximised: "mail" }, undefined, 2),
    ]).toStrictEqual([
      { ok: true, value: { fullscreen: undefined, maximised: "mail" } },
      { ok: true, value: NO_SPOTLIGHT },
    ]);
  });

  it("refuses with no focused pane, and in a group of one pane", () => {
    expect([
      toggleMaximised(NO_SPOTLIGHT, undefined, 2),
      toggleMaximised(NO_SPOTLIGHT, "mail", 1),
    ]).toStrictEqual([
      { error: "unknownPane", ok: false },
      { error: "lastPane", ok: false },
    ]);
  });
});

describe(afterFocus, () => {
  it("shows every pane again when another pane than the maximised one is focused, and changes nothing otherwise", () => {
    const maximised = { ...NO_SPOTLIGHT, maximised: "mail" };
    expect([
      afterFocus(maximised, "calendar"),
      afterFocus(maximised, "mail") === maximised,
      afterFocus(NO_SPOTLIGHT, "mail") === NO_SPOTLIGHT,
    ]).toStrictEqual([NO_SPOTLIGHT, true, true]);
  });
});

describe(afterClose, () => {
  it("leaves nothing maximised, and forgets the fullscreen tab only when it is the one closed", () => {
    expect([afterClose(both, "video"), afterClose(both, "mail")]).toStrictEqual(
      [NO_SPOTLIGHT, { fullscreen: "video", maximised: undefined }]
    );
  });
});

describe(afterFullscreen, () => {
  it("follows the tab whose page entered fullscreen, and its leaving only", () => {
    const entered = afterFullscreen(NO_SPOTLIGHT, "video", true);
    expect([
      entered,
      afterFullscreen(entered, "video", true) === entered,
      afterFullscreen(entered, "mail", false) === entered,
      afterFullscreen(entered, "video", false),
    ]).toStrictEqual([
      { fullscreen: "video", maximised: undefined },
      true,
      true,
      NO_SPOTLIGHT,
    ]);
  });
});

describe(fullscreenPaneOf, () => {
  it("finds the fullscreen tab's pane in the layout shown, and none while it is not there", () => {
    const shown = leaf("p1", "video");
    expect([
      fullscreenPaneOf(shown, both),
      fullscreenPaneOf(leaf("p2", "mail"), both),
      fullscreenPaneOf(shown, NO_SPOTLIGHT),
    ]).toStrictEqual(["p1", undefined, undefined]);
  });
});
