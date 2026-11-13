import { describe, expect, it } from "vitest";

import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import { createUpdateStore } from "./store.ts";

const mount = (seed: unknown) => {
  const bridge = new FakeBridge();
  bridge.answers.set("updater.snapshot", seed);
  const store = createUpdateStore(
    createClient({ meru: bridge }, rendererSurface)
  );
  return { bridge, store };
};

describe(createUpdateStore, () => {
  it("holds the seeded kind, then each pushed one", () => {
    const { bridge, store } = mount({ ok: true, value: { kind: "idle" } });
    expect(store.get().kind).toBe("idle");
    bridge.emit("updater.changed", { kind: "ready", version: "4.0.1" });
    expect(store.get().kind).toBe("ready");
  });

  it("is idle when the seed does not parse, and ignores a push that does not", () => {
    const { bridge, store } = mount({ ok: true, value: { kind: "done" } });
    expect(store.get().kind).toBe("idle");
    bridge.emit("updater.changed", { kind: "downloading", percent: 140 });
    expect(store.get().kind).toBe("idle");
  });
});
