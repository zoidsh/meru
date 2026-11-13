import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import type { Result } from "../core/result.ts";
import { commands } from "../shared/channels/commands.ts";
import type { IpcError } from "../shared/channels/define.ts";
import {
  defineChannels,
  definePushes,
  event,
  push,
} from "../shared/channels/define.ts";
import { stage, stagePushes } from "../shared/channels/stage.ts";
import type { StageSnapshot } from "../shared/channels/stage.ts";
import { chromeSurface } from "../shared/channels/surfaces.ts";
import { FakeBridge } from "../test/fakes/bridge.ts";
import { createClient } from "./client.ts";

const elsewhere = defineChannels("elsewhere", {
  poke: event(z.object({ orientation: z.enum(["vertical", "horizontal"]) })),
});
// Channels are told apart by their schemas' types, so this push carries a payload no surface's push has.
const elsewherePushes = definePushes("elsewhere", {
  poked: push(z.object({ pokedAt: z.date() })),
});

const snapshot: StageSnapshot = {
  dividers: [],
  focusedPaneId: "p1",
  navigation: null,
  panes: [
    {
      paneId: "p1",
      rect: { height: 10, width: 10, x: 0, y: 0 },
      tabId: "t1",
    },
  ],
  style: "modern",
};

const connect = () => {
  const bridge = new FakeBridge("linux");
  return { bridge, client: createClient({ meru: bridge }, chromeSurface) };
};

describe(createClient, () => {
  it("reads the platform from the bridge", () => {
    expect(connect().client.platform).toBe("linux");
  });

  it("refuses a page without the bridge", () => {
    expect(() => createClient(window, chromeSurface)).toThrow(
      "window.meru is missing"
    );
    expect(() =>
      createClient({ meru: { platform: "linux" } }, chromeSurface)
    ).toThrow("window.meru is missing");
  });

  it("sends an event under its declared name", () => {
    const { bridge, client } = connect();
    client.send(stage.beginDrag, { kind: "divider", splitId: "s1" });
    expect(bridge.sent).toStrictEqual([
      {
        channel: "stage.beginDrag",
        payload: { kind: "divider", splitId: "s1" },
      },
    ]);
  });

  it("parses an invoke's answer against its result schema", async () => {
    const { bridge, client } = connect();
    bridge.answers.set("commands.run", { ok: true, value: null });
    await expect(
      client.invoke(commands.run, { id: "stage.splitVertical" })
    ).resolves.toStrictEqual({ ok: true, value: null });

    bridge.answers.set("commands.run", { ok: true, value: { stage: 1 } });
    const malformed = await client.invoke(commands.run, {
      id: "stage.splitVertical",
    });
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
      client.send(stage.beginDrag, { splitId: 7 });
      // @ts-expect-error A channel of another surface.
      client.send(elsewhere.poke, { orientation: "vertical" });
      // @ts-expect-error An event is not invoked.
      void client.invoke(stage.beginDrag, { splitId: "s1" });
      // @ts-expect-error A push of another surface.
      client.on(elsewherePushes.poked, () => {
        throw new Error("never pushed");
      });
    };
    expectTypeOf(refused).toBeFunction();
  });
});
