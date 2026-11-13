import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn, launch, stageOf, viewsOf } from "./app.ts";
import { startStub } from "./entitlement-stub.ts";

const createProfile = async (chrome: Page, label: string) =>
  await invokeIn(chrome, profiles.create, { label });

const kindOf = async (chrome: Page) => {
  const { entitlement } = await stageOf(chrome);
  return entitlement.kind;
};

test("opens a fresh install on one profile with one Gmail tab in one pane", async () => {
  const { app, chrome, close } = await launch();
  try {
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(1);
    const windows = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    );
    const { profiles: state, stage } = await stageOf(chrome);
    expect({
      groups: state.groups.map((group) => group.tabIds.length),
      panes: stage.panes.length,
      profiles: state.profiles.map((profile) => profile.label),
      tabs: state.tabs.map((tab) => tab.appId),
      windows,
    }).toStrictEqual({
      groups: [1],
      panes: 1,
      profiles: ["Personal"],
      tabs: ["gmail"],
      windows: 1,
    });
  } finally {
    await close();
  }
});

test("creates a second profile under a trial and refuses one when free", async () => {
  const stub = await startStub();
  try {
    const trial = await launch({ env: { MERU_ENTITLEMENT_URL: stub.url } });
    try {
      await expect.poll(async () => await kindOf(trial.chrome)).toBe("trial");
      expect(await createProfile(trial.chrome, "Work")).toMatchObject({
        ok: true,
        value: { label: "Work", order: 1 },
      });
      const { profiles: state } = await stageOf(trial.chrome);
      expect(state.profiles.map((profile) => profile.label)).toStrictEqual([
        "Personal",
        "Work",
      ]);
    } finally {
      await trial.close();
    }

    stub.answer(null, { days: -1, kind: "trial" });
    const free = await launch({ env: { MERU_ENTITLEMENT_URL: stub.url } });
    try {
      await expect.poll(async () => await kindOf(free.chrome)).toBe("free");
      expect(await createProfile(free.chrome, "Work")).toMatchObject({
        error: { kind: "failed", message: "free" },
        ok: false,
      });
    } finally {
      await free.close();
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
