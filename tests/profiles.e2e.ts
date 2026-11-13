import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, launch } from "../scripts/lib/app.ts";
import { entitlementOf, profilesOf } from "./app.ts";
import { startStub } from "./entitlement-stub.ts";

const createProfile = async (chrome: Page, label: string) =>
  await invokeIn(chrome, profiles.create, { label });

const kindOf = async (chrome: Page) => {
  const { kind } = await entitlementOf(chrome);
  return kind;
};

test("creates a second profile under a trial", async () => {
  const stub = await startStub();
  try {
    const trial = await launch({ env: { MERU_ENTITLEMENT_URL: stub.url } });
    try {
      await expect.poll(async () => await kindOf(trial.chrome)).toBe("trial");
      expect(await createProfile(trial.chrome, "Work")).toMatchObject({
        ok: true,
        value: { label: "Work", order: 1 },
      });
      const state = await profilesOf(trial.chrome);
      expect(state.profiles.map((profile) => profile.label)).toStrictEqual([
        "Personal",
        "Work",
      ]);
    } finally {
      await trial.close();
    }
  } finally {
    await stub.stop();
  }
});

test("opens the window where it was when the app last quit", async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));
  const placed = { height: 600, width: 900, x: 40, y: 80 };
  try {
    const first = await launch({ userData });
    let moved: unknown;
    try {
      moved = await first.app.evaluate(({ BrowserWindow }, bounds) => {
        const [window] = BrowserWindow.getAllWindows();
        window?.setBounds(bounds);
        return window?.getBounds();
      }, placed);
    } finally {
      await first.close();
    }
    const second = await launch({ userData });
    try {
      const restored = await second.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getBounds()
      );
      expect(restored).toStrictEqual(moved);
    } finally {
      await second.close();
    }
  } finally {
    await rm(userData, { force: true, recursive: true });
  }
});
