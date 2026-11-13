import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useDebounced } from "./use-debounced.ts";
import type { Debounced } from "./use-debounced.ts";

const mount = () => {
  const ran: string[] = [];
  let debounced: Debounced<[string]> | undefined;
  const Probe = () => {
    debounced = useDebounced((text: string) => {
      ran.push(text);
    }, 100);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(<Probe />);
  });
  const call = (text: string) => {
    debounced?.call(text);
  };
  const unmount = () => {
    act(() => {
      root.unmount();
    });
  };
  return { call, flush: () => debounced?.flush(), ran, unmount };
};

describe(useDebounced, () => {
  beforeAll(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once the calls pause, with the last call's arguments", () => {
    vi.useFakeTimers();
    const { call, ran, unmount } = mount();
    call("a");
    vi.advanceTimersByTime(50);
    call("ab");
    vi.advanceTimersByTime(99);
    const early = [...ran];
    vi.advanceTimersByTime(1);
    expect([early, ran]).toStrictEqual([[], ["ab"]]);
    unmount();
  });

  it("runs a waiting call at once when flushed, as a field does on blur, and only once", () => {
    vi.useFakeTimers();
    const { call, flush, ran, unmount } = mount();
    call("typed");
    flush();
    vi.advanceTimersByTime(100);
    expect(ran).toStrictEqual(["typed"]);
    unmount();
  });

  it("runs a waiting call when the component goes, so nothing typed is lost", () => {
    const { call, ran, unmount } = mount();
    call("typed");
    unmount();
    expect(ran).toStrictEqual(["typed"]);
  });
});
