import { describe, expect, it } from "vitest";

import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import { createEntitlementStore } from "./store.ts";

const trial = {
  endsAt: 1_800_000_000_000,
  expiresAt: 1_790_000_000_000,
  kind: "trial",
  source: "stored",
};

const mount = (seed: unknown) => {
  const bridge = new FakeBridge();
  bridge.answers.set("entitlement.snapshot", seed);
  const store = createEntitlementStore(
    createClient({ meru: bridge }, rendererSurface)
  );
  return { bridge, store };
};

describe(createEntitlementStore, () => {
  it("holds the seeded kind, then each pushed one", () => {
    const { bridge, store } = mount({ ok: true, value: trial });
    expect(store.get().kind).toBe("trial");
    bridge.emit("entitlement.changed", {
      expiresAt: null,
      kind: "disabled",
      reason: "refunded",
      source: "refreshed",
    });
    expect(store.get().kind).toBe("disabled");
  });

  it("is unknown when the seed does not parse, and ignores a push that does not", () => {
    const { bridge, store } = mount({ ok: true, value: { kind: "pro" } });
    expect(store.get().kind).toBe("unknown");
    bridge.emit("entitlement.changed", { kind: "licensed" });
    expect(store.get().kind).toBe("unknown");
  });
});
