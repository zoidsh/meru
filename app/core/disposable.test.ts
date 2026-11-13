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

  it("runs a disposer added after disposal at once", () => {
    const { disposer, ran } = recorder();
    const store = new DisposableStore();
    store.dispose();
    store.add(disposer("late"));
    expect(ran).toStrictEqual(["late"]);
  });
});
