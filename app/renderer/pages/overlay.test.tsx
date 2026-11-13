import { act } from "react";
import { describe, expect, it } from "vitest";

import { wireName } from "../../shared/channels/define.ts";
import { themePushes } from "../../shared/channels/theme.ts";
import { FakeBridge } from "../../test/fakes/bridge.ts";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("overlay page", () => {
  it("draws the launcher its URL names, in the theme it names, and follows theme.changed after", async () => {
    const bridge = new FakeBridge();
    Reflect.set(window, "meru", bridge);
    history.replaceState(null, "", "/overlay.html?kind=launcher&theme=light");
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    await act(async () => {
      await import("./overlay.tsx");
    });
    const { classList } = document.documentElement;
    const painted = classList.contains("dark");
    act(() => {
      bridge.emit(wireName(themePushes.changed), { theme: "dark" });
    });
    expect([painted, classList.contains("dark")]).toStrictEqual([false, true]);
    expect(document.querySelector("[role=dialog] input")).not.toBeNull();
  });
});
