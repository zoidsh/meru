import { describe, expect, it } from "vitest";

import { createStore } from "./store.ts";

describe(createStore, () => {
  it("notifies subscribers of a change and not of a no-op", () => {
    const store = createStore({ count: 0 });
    const seen: number[] = [];
    const unsubscribe = store.subscribe(() => {
      seen.push(store.get().count);
    });

    store.set((state) => ({ count: state.count + 1 }));
    store.set((state) => state);
    unsubscribe();
    store.set((state) => ({ count: state.count + 1 }));

    expect(seen).toStrictEqual([1]);
    expect(store.get().count).toBe(2);
  });
});
