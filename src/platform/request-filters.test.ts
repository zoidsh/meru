import { describe, expect, it } from "vitest";

import { createRequestFilters } from "./request-filters.ts";
import type { FilteredRequest, FilteredSession } from "./request-filters.ts";

type Listener = Parameters<FilteredSession["webRequest"]["onBeforeRequest"]>[0];

/** A session that keeps its one listener, as Electron's does, and counts each set. */
const fakeSession = () => {
  let listener: Listener = null;
  const sets: ("listener" | "null")[] = [];
  const session: FilteredSession = {
    webRequest: {
      onBeforeRequest: (next) => {
        listener = next;
        sets.push(next ? "listener" : "null");
      },
    },
  };
  /** What the session does to a request: unasked, cancelled or let through. */
  const send = (request: FilteredRequest) => {
    if (!listener) {
      return "unasked";
    }

    let outcome = "";

    listener(request, ({ cancel }) => {
      outcome = cancel ? "cancelled" : "allowed";
    });

    return outcome;
  };

  return { session, sets, send };
};

const AD = { url: "https://ad.example/x", resourceType: "image" };
const PAGE = { url: "https://example.com/", resourceType: "image" };
const blocksAds = (request: FilteredRequest) => request.url === AD.url;

describe(createRequestFilters, () => {
  it("leaves a session unasked until a filter is set, and sets one listener for it", () => {
    const filters = createRequestFilters();
    const { session, sets, send } = fakeSession();

    expect(send(AD)).toBe("unasked");

    filters.block(session, undefined);

    expect([sets, send(AD)]).toStrictEqual([[], "unasked"]);

    filters.block(session, blocksAds);

    expect([sets, send(AD), send(PAGE)]).toStrictEqual([
      ["listener"],
      "cancelled",
      "allowed",
    ]);
  });

  it("swaps one blocker for another without setting the listener again", () => {
    const filters = createRequestFilters();
    const { session, sets, send } = fakeSession();

    filters.block(session, blocksAds);
    filters.block(session, () => true);

    expect([sets, send(PAGE)]).toStrictEqual([["listener"], "cancelled"]);
  });

  it("takes the listener off when the blocker stops with no guard, and sets it again after", () => {
    const filters = createRequestFilters();
    const { session, sets, send } = fakeSession();

    filters.block(session, blocksAds);
    filters.block(session, undefined);

    expect([sets, send(AD)]).toStrictEqual([["listener", "null"], "unasked"]);

    filters.block(session, blocksAds);

    expect([sets, send(AD)]).toStrictEqual([
      ["listener", "null", "listener"],
      "cancelled",
    ]);
  });

  it("asks the blocker before the guard, so the guard never sees what was blocked, and keeps the guard once the blocker stops", () => {
    const filters = createRequestFilters();
    const { session, sets, send } = fakeSession();
    const guarded: string[] = [];

    filters.guard(session, (request) => {
      guarded.push(request.url);

      return request.url !== PAGE.url;
    });
    filters.block(session, blocksAds);

    expect([send(AD), send(PAGE), guarded]).toStrictEqual([
      "cancelled",
      "allowed",
      [PAGE.url],
    ]);

    filters.block(session, undefined);

    expect([sets, send(AD)]).toStrictEqual([["listener"], "cancelled"]);
  });
});
