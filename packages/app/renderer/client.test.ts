import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import type { Result } from "../core/result.ts";
import type { IpcError } from "../shared/channels/define.ts";
import {
  defineChannels,
  definePushes,
  event,
  push,
} from "../shared/channels/define.ts";
import { e2e, stage, stagePushes } from "../shared/channels/stage.ts";
import { rendererSurface } from "../shared/channels/surfaces.ts";
import type { StageSnapshot } from "../shared/stage.ts";
import { FakeBridge } from "../test/fakes/bridge.ts";
import { createClient } from "./client.ts";

const elsewhere = defineChannels("elsewhere", {
  poke: event(z.object({ orientation: z.enum(["vertical", "horizontal"]) })),
});
const elsewherePushes = definePushes("elsewhere", {
  poked: push(z.object({})),
});

const snapshot: StageSnapshot = {
  dividers: [],
  focusedPaneId: "p1",
  panes: [{ paneId: "p1", rect: { height: 10, width: 10, x: 0, y: 0 } }],
  style: "modern",
};

const connect = () => {
  const bridge = new FakeBridge("linux");
  return { bridge, client: createClient({ meru: bridge }, rendererSurface) };
};

describe(createClient, () => {
  it("reads the platform from the bridge", () => {
    expect(connect().client.platform).toBe("linux");
  });

  it("refuses a page without the bridge", () => {
    expect(() => createClient(window, rendererSurface)).toThrow(
      "window.meru is missing"
    );
    expect(() =>
      createClient({ meru: { platform: "linux" } }, rendererSurface)
    ).toThrow("window.meru is missing");
  });

  it("sends an event under its declared name", () => {
    const { bridge, client } = connect();
    client.send(stage.split, { orientation: "vertical" });
    expect(bridge.sent).toStrictEqual([
      { channel: "stage.split", payload: { orientation: "vertical" } },
    ]);
  });

  it("parses an invoke's answer against its result schema", async () => {
    const { bridge, client } = connect();
    bridge.answers.set("e2e.snapshot", {
      ok: true,
      value: { stage: snapshot, views: [], zoom: [] },
    });
    await expect(client.invoke(e2e.snapshot, {})).resolves.toStrictEqual({
      ok: true,
      value: { stage: snapshot, views: [], zoom: [] },
    });

    bridge.answers.set("e2e.snapshot", { ok: true, value: { stage: 1 } });
    const malformed = await client.invoke(e2e.snapshot, {});
    expect(malformed.ok).toBeFalsy();
  });

  it("passes on an error the main process answered", () => {
    const { bridge, client } = connect();
    const error = { kind: "invalidPayload", message: "no" };
    bridge.answers.set("stage.snapshot", { error, ok: false });
    expect(client.sendSync(stage.snapshot, {})).toStrictEqual({
      error,
      ok: false,
    });
  });

  it("delivers a push that parses and drops one that does not", () => {
    const { bridge, client } = connect();
    const seen: StageSnapshot[] = [];
    const unsubscribe = client.on(stagePushes.changed, (payload) => {
      seen.push(payload);
    });

    bridge.emit("stage.changed", snapshot);
    bridge.emit("stage.changed", { panes: "nope" });
    unsubscribe();
    bridge.emit("stage.changed", snapshot);

    expect(seen).toStrictEqual([snapshot]);
  });

  it("types every call from the channel declarations", () => {
    const { client } = connect();
    expectTypeOf(client.sendSync(stage.snapshot, {})).toEqualTypeOf<
      Result<StageSnapshot, IpcError>
    >();
    // Never called: these lines exist for the compiler to refuse.
    const refused = () => {
      // @ts-expect-error A payload the schema does not describe.
      client.send(stage.split, { orientation: "diagonal" });
      // @ts-expect-error A channel of another surface.
      client.send(elsewhere.poke, { orientation: "vertical" });
      // @ts-expect-error An event is not invoked.
      void client.invoke(stage.split, { orientation: "vertical" });
      // @ts-expect-error A push of another surface.
      client.on(elsewherePushes.poked, () => {
        throw new Error("never pushed");
      });
    };
    expectTypeOf(refused).toBeFunction();
  });
});
