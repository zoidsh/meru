import { describe, expect, it } from "vitest";

import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import { createEntitlementStore, markEntitlement } from "./store.ts";

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
  const element = document.createElement("html");
  markEntitlement(store, element);
  return { bridge, element, store };
};

describe(createEntitlementStore, () => {
  it("marks the root with the seeded kind, then with each pushed one", () => {
    const { bridge, element } = mount({ ok: true, value: trial });
    expect(element.dataset.entitlement).toBe("trial");
    bridge.emit("entitlement.changed", {
      expiresAt: null,
      kind: "disabled",
      reason: "refunded",
      source: "refreshed",
    });
    expect(element.dataset.entitlement).toBe("disabled");
  });

  it("is unknown when the seed does not parse, and ignores a push that does not", () => {
    const { bridge, element } = mount({ ok: true, value: { kind: "pro" } });
    expect(element.dataset.entitlement).toBe("unknown");
    bridge.emit("entitlement.changed", { kind: "licensed" });
    expect(element.dataset.entitlement).toBe("unknown");
  });
});
