import { describe, expect, it } from "vitest";

import { isKeyMadeMenu } from "./context-menu.ts";

describe(isKeyMadeMenu, () => {
  it("tells the keyboard's contextmenu, with no button, from a click's", () => {
    expect(isKeyMadeMenu({ button: -1 })).toBeTruthy();
    expect(isKeyMadeMenu({ button: 2 })).toBeFalsy();
    // Control-click on macOS
    expect(isKeyMadeMenu({ button: 0 })).toBeFalsy();
  });
});
