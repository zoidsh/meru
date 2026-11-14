import { describe, expect, it } from "vitest";

import { DisposableStore } from "./disposable.ts";

const recorder = () => {
  const ran: string[] = [];
  const disposer = (name: string) => () => {
    ran.push(name);
  };
  return { disposer, ran };
};

describe(DisposableStore, () => {
  it("runs every disposer once, the last added first", () => {
    const { disposer, ran } = recorder();
    const store = new DisposableStore();
    store.add(disposer("a"), disposer("b"));
    store.add(disposer("c"));
    store.dispose();
    store.dispose();
    expect(ran).toStrictEqual(["c", "b", "a"]);
    expect(store.disposed).toBeTruthy();
  });

  it("forgets a tracked disposer run early, and runs one not run early at disposal, each once", () => {
    const { disposer, ran } = recorder();
    const store = new DisposableStore();
    const early = store.track(disposer("early"));
    store.track(disposer("late"));
    early();
    early();
    const waiting = store.size;
    store.dispose();
    expect([ran, waiting, store.size]).toStrictEqual([["early", "late"], 1, 0]);
  });

  it("runs a disposer added after disposal at once", () => {
    const { disposer, ran } = recorder();
    const store = new DisposableStore();
    store.dispose();
    store.add(disposer("late"));
    expect(ran).toStrictEqual(["late"]);
  });
});
