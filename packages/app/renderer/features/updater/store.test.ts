import { describe, expect, it } from "vitest";

import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import { createUpdateStore, markUpdate } from "./store.ts";

const mount = (seed: unknown) => {
  const bridge = new FakeBridge();
  bridge.answers.set("updater.snapshot", seed);
  const store = createUpdateStore(
    createClient({ meru: bridge }, rendererSurface)
  );
  const element = document.createElement("html");
  markUpdate(store, element);
  return { bridge, element };
};

describe(createUpdateStore, () => {
  it("marks the root with the seeded kind, then with each pushed one", () => {
    const { bridge, element } = mount({ ok: true, value: { kind: "idle" } });
    expect(element.dataset.update).toBe("idle");
    bridge.emit("updater.changed", { kind: "ready", version: "4.0.1" });
    expect(element.dataset.update).toBe("ready");
  });

  it("is idle when the seed does not parse, and ignores a push that does not", () => {
    const { bridge, element } = mount({ ok: true, value: { kind: "done" } });
    expect(element.dataset.update).toBe("idle");
    bridge.emit("updater.changed", { kind: "downloading", percent: 140 });
    expect(element.dataset.update).toBe("idle");
  });
});
