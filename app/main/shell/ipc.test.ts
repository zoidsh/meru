import { describe, expect, it } from "vitest";
import { z } from "zod";

import { err, ok } from "../../core/result.ts";
import {
  defineChannels,
  definePushes,
  defineSurface,
  event,
  invoke,
  push,
} from "../../shared/channels/define.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLog } from "../../test/fakes/log.ts";
import { IpcDispatcher } from "./ipc.ts";

const counter = defineChannels("counter", {
  add: invoke(z.object({ by: z.number().int() }), z.number()),
  explode: event(z.object({})),
  refuse: event(z.object({})),
});
const counterPushes = definePushes("counter", {
  changed: push(z.object({ value: z.number() })),
});
const other = defineChannels("other", { ping: event(z.object({})) });

const surface = defineSurface({ pushes: [counterPushes], requests: [counter] });
const otherSurface = defineSurface({ pushes: [], requests: [other] });

const setup = () => {
  const transport = new FakeIpcTransport();
  const log = new FakeLog();
  const dispatcher = new IpcDispatcher({
    log: log.scoped("ipc"),
    transport,
  });
  const seen: number[] = [];
  dispatcher.register(counter, {
    add: ({ by }) => {
      seen.push(by);
      return ok(by + 1);
    },
    explode: () => {
      throw new Error("boom");
    },
    refuse: () => err("not now"),
  });
  dispatcher.register(other, { ping: () => ok(undefined) });
  dispatcher.assign(1, surface);
  dispatcher.assign(2, otherSurface);
  return { dispatcher, log, seen, transport };
};

describe(IpcDispatcher, () => {
  it("calls the handler with the parsed payload and returns its result", () => {
    const { dispatcher, seen } = setup();
    expect(dispatcher.dispatch(1, "counter.add", { by: 2 })).toStrictEqual({
      ok: true,
      value: 3,
    });
    expect(seen).toStrictEqual([2]);
  });

  it("rejects a payload the schema refuses without reaching the handler", () => {
    const { dispatcher, seen } = setup();
    const result = dispatcher.dispatch(1, "counter.add", { by: "two" });
    expect(result).toMatchObject({ error: { kind: "invalidPayload" } });
    expect(seen).toStrictEqual([]);
  });

  it("turns a handler's error into an error result", () => {
    const { dispatcher } = setup();
    expect(dispatcher.dispatch(1, "counter.refuse", {})).toStrictEqual({
      error: { kind: "failed", message: "not now" },
      ok: false,
    });
  });

  it("turns a handler that throws into an error result carrying the error", () => {
    const { dispatcher, log } = setup();
    expect(dispatcher.dispatch(1, "counter.explode", {})).toMatchObject({
      error: {
        error: { message: "boom", name: "Error" },
        kind: "threw",
      },
    });
    expect(log.at("error")).toStrictEqual(["A request's handler threw"]);
  });

  it("rejects an unknown channel", () => {
    const { dispatcher } = setup();
    expect(dispatcher.dispatch(1, "counter.nope", {})).toMatchObject({
      error: { kind: "unknownChannel" },
    });
  });

  it("rejects a channel of another surface, and a sender with none", () => {
    const { dispatcher } = setup();
    expect(dispatcher.dispatch(2, "counter.add", { by: 1 })).toMatchObject({
      error: { kind: "unknownChannel" },
    });
    expect(dispatcher.dispatch(3, "other.ping", {})).toMatchObject({
      error: { kind: "wrongSurface" },
    });
  });

  it("pushes under the declared name", () => {
    const { dispatcher, transport } = setup();
    dispatcher.push(1, counterPushes.changed, { value: 4 });
    expect(transport.sent).toStrictEqual([
      { channel: "counter.changed", contentsId: 1, payload: { value: 4 } },
    ]);
  });

  it("broadcasts to every sender whose surface has the push, and forgets one that is gone", () => {
    const { dispatcher, transport } = setup();
    dispatcher.assign(3, surface);
    dispatcher.broadcast(counterPushes.changed, { value: 1 });
    transport.gone.add(3);
    dispatcher.broadcast(counterPushes.changed, { value: 2 });
    transport.gone.delete(3);
    dispatcher.broadcast(counterPushes.changed, { value: 3 });
    expect(
      transport.sent.map(({ contentsId, payload }) => [contentsId, payload])
    ).toStrictEqual([
      [1, { value: 1 }],
      [3, { value: 1 }],
      [1, { value: 2 }],
      [1, { value: 3 }],
    ]);
    expect(dispatcher.dispatch(3, "counter.add", { by: 1 })).toMatchObject({
      error: { kind: "wrongSurface" },
    });
  });

  it("takes only handlers that match the declaration", () => {
    const { dispatcher } = setup();
    const register = () => {
      // @ts-expect-error A handler is missing.
      dispatcher.register(other, {});
      dispatcher.register(other, {
        // @ts-expect-error A payload field the schema does not have.
        ping: ({ missing }: { missing: string }) => ok(missing),
      });
      dispatcher.register(counter, {
        // @ts-expect-error A result the schema does not describe.
        add: () => ok("three"),
        explode: () => ok(undefined),
        refuse: () => ok(undefined),
      });
      // @ts-expect-error A push payload the schema does not describe.
      dispatcher.push(1, counterPushes.changed, { value: "four" });
    };
    expect(register).toThrow("other.ping has no handler");
  });
});
