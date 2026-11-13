import { describe, expect, it } from "vitest";

import { DEFAULT_WINDOW_SIZE } from "../../../core/engines/bounds.ts";
import { AppEvents } from "../../../core/events.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import { FakeApp } from "../../../test/fakes/app.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeDisplays, PRIMARY_DISPLAY } from "../../../test/fakes/display.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Windows, WINDOWS_FILE, windowsStateSchema } from "./index.ts";

const NOW = 1_800_000_000_000;
const trial: Entitlement = {
  endsAt: NOW + 86_400_000,
  expiresAt: NOW + 3_600_000,
  kind: "trial",
  source: "stored",
};

const fail = (error: unknown) => {
  throw error;
};

const setup = async (fs = new FakeFs()) => {
  const clock = new FakeClock(NOW);
  const app = new FakeApp();
  const events = new AppEvents();
  const registrar = new FakeRegistrar();
  const settings = new SettingsStore({
    app,
    clock,
    fs,
    onError: fail,
    onFallback: fail,
    registrar,
    watchFile: false,
  });
  await settings.open();
  const profiles = new Profiles({
    app,
    clock,
    entitlement: trial,
    events,
    fs,
    ids: fakeIds("p"),
    onError: fail,
    registrar,
    report: fail,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  profiles.start();
  const displays = new FakeDisplays();
  const reports: string[] = [];
  const windows = new Windows({
    app,
    clock,
    displays,
    events,
    fs,
    ids: fakeIds("w"),
    onError: fail,
    profiles,
    report: (message) => {
      reports.push(message);
    },
  });
  await windows.open();
  windows.start();
  const stored = () => {
    const parsed: unknown = JSON.parse(fs.files.get(WINDOWS_FILE) ?? "null");
    return windowsStateSchema.parse(
      typeof parsed === "object" && parsed !== null && "data" in parsed
        ? parsed.data
        : undefined
    ).windows;
  };
  return { app, clock, displays, fs, profiles, reports, stored, windows };
};

describe(Windows, () => {
  it("opens the main window at the default size on the primary display, showing the selected profile's group", async () => {
    const { windows, profiles } = await setup();
    const { workArea } = PRIMARY_DISPLAY;
    expect(windows.mainBounds()).toStrictEqual({
      ...DEFAULT_WINDOW_SIZE,
      x: workArea.x + (workArea.width - DEFAULT_WINDOW_SIZE.width) / 2,
      y:
        workArea.y +
        Math.floor((workArea.height - DEFAULT_WINDOW_SIZE.height) / 2),
    });
    expect(windows.mainGroupId()).toBe(profiles.currentGroup()?.id);
  });

  it("writes the bounds a while after the window moved, and at once when it closes", async () => {
    const { windows, clock, stored, fs } = await setup();
    const window = new FakeWindow(1200, 800, 100, 100);
    windows.attachMain(window);
    window.setBounds({ height: 700, width: 900, x: 300, y: 200 });
    window.setBounds({ height: 700, width: 900, x: 320, y: 210 });
    clock.advance(500);
    await windows.flush();
    expect(
      fs.writes.filter((write) => write.name === WINDOWS_FILE)
    ).toHaveLength(1);
    expect(stored()?.[0]?.bounds).toStrictEqual({
      height: 700,
      width: 900,
      x: 320,
      y: 210,
    });
    window.setBounds({ height: 500, width: 600, x: 10, y: 40 });
    window.close();
    await Promise.resolve();
    await windows.flush();
    expect(stored()?.[0]?.bounds).toStrictEqual({
      height: 500,
      width: 600,
      x: 10,
      y: 40,
    });
  });

  it("restores the bounds across a restart, clamped to the displays there are now", async () => {
    const first = await setup();
    const window = new FakeWindow();
    first.windows.attachMain(window);
    window.setBounds({ height: 600, width: 800, x: 2500, y: 300 });
    await first.windows.flush();
    await first.profiles.flush();
    const second = await setup(first.fs);
    expect(second.windows.mainBounds()).toStrictEqual({
      height: 600,
      width: 800,
      x: 560,
      y: 252,
    });
    second.displays.current = [
      PRIMARY_DISPLAY,
      {
        primary: false,
        workArea: { height: 1440, width: 2560, x: 1920, y: 0 },
      },
    ];
    expect(second.windows.mainBounds()).toStrictEqual({
      height: 600,
      width: 800,
      x: 2500,
      y: 300,
    });
  });

  it("shows the group of a newly selected profile, and the profile's current group once the one it showed is gone", async () => {
    const { windows, profiles } = await setup();
    const first = profiles.selected().id;
    const created = profiles.createProfile("Work");
    if (!created.ok) {
      throw new Error(created.error);
    }
    const work = created.value.id;
    const gmailGroup = profiles.currentGroup(work)?.id;
    profiles.selectProfile(work);
    expect(windows.mainGroupId()).toBe(gmailGroup);
    const drive = profiles.addTab(work, "drive");
    if (!drive.ok) {
      throw new Error(drive.error);
    }
    profiles.moveTab(drive.value.id, 0);
    profiles.selectProfile(first);
    profiles.selectProfile(work);
    const driveGroup = profiles.currentGroup(work)?.id;
    expect(windows.windows.map((window) => window.groupId)).toStrictEqual([
      driveGroup,
    ]);
    profiles.closeTab(drive.value.id);
    expect(windows.mainGroupId()).toBe(gmailGroup);
  });

  it("opens where a new window would when the file cannot be read", async () => {
    const { reports, windows } = await setup(
      new FakeFs({
        [WINDOWS_FILE]: JSON.stringify({ data: { windows: 3 }, version: 1 }),
      })
    );
    expect(reports).toHaveLength(1);
    expect(windows.windows).toStrictEqual([]);
  });
});
