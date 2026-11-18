import { describe, expect, it } from "vitest";

import type { ShellSyncMessage } from "#contract/shell.ts";

import { createShellSync } from "./sync.ts";

const slice = (selectedProfileId: string) => ({
  profiles: [
    {
      id: "a",
      name: "Default",
      color: "#2d52d2",
      mail: { status: "unknown" as const, unreadCount: null },
      asleep: false,
    },
  ],
  selectedProfileId,
});

describe(createShellSync, () => {
  it("starts the handshake for its slices, has nothing until the snapshot, then follows each patch", () => {
    let deliver: ((message: ShellSyncMessage) => void) | undefined;
    const asked: unknown[] = [];
    const sync = createShellSync(
      {
        sync: (slices, listener) => {
          asked.push(slices);
          deliver = listener;

          return () => false;
        },
      },
      ["profiles"]
    );
    let notified = 0;

    sync.subscribe(() => {
      notified += 1;
    });

    expect([asked, sync.read("profiles")]).toStrictEqual([
      [["profiles"]],
      undefined,
    ]);

    deliver?.({ kind: "snapshot", slices: { profiles: slice("a") } });
    const first = sync.read("profiles");

    expect(first).toStrictEqual(slice("a"));
    // The same value until something changes, as useSyncExternalStore needs.
    expect(sync.read("profiles")).toBe(first);

    deliver?.({ kind: "patch", slice: "profiles", value: slice("b") });

    expect(sync.read("profiles")).toStrictEqual(slice("b"));
    expect(notified).toBe(2);
  });
});
