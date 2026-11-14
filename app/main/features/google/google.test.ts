import { describe, expect, it } from "vitest";

import type { Tab } from "../../../core/records/tab.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { googlePushes } from "../../../shared/channels/google.ts";
import { unwrap } from "../../../test/result.ts";
import { testApp } from "../../testing.ts";
import { Google } from "./index.ts";

const tabOf = (id: string, appId: string): Tab => ({
  appId,
  health: "ok",
  id,
  profileId: "personal",
  sleeps: true,
  title: null,
  url: "https://meet.google.com/",
  zoom: 1,
});

const setup = async () => {
  const app = await testApp();
  const google = new Google({
    commands: app.commands,
    preload: "/dist/preload/google.cjs",
    registrar: app.registrar,
  });
  google.start();
  const toggles = () =>
    app.transport.sent
      .filter((sent) => sent.channel === wireName(googlePushes.meetToggle))
      .map(({ contentsId, payload }) => ({ contentsId, payload }));
  return { app, google, toggles };
};

describe(Google, () => {
  it("toggles the latest Meet page's microphone and camera, and nothing while none is open", async () => {
    const { app, google, toggles } = await setup();
    expect(app.commands.enabled("google.toggleMeetMicrophone")).toBeFalsy();
    google.page(tabOf("docs", "docs")).attach(3);
    const first = google.page(tabOf("first", "meet")).attach(4);
    const second = google.page(tabOf("second", "meet")).attach(5);
    unwrap(app.commands.run("google.toggleMeetMicrophone", { windowId: 1 }));
    second();
    unwrap(app.commands.run("google.toggleMeetCamera", { windowId: 1 }));
    expect(toggles()).toStrictEqual([
      { contentsId: 5, payload: { toggle: "microphone" } },
      { contentsId: 4, payload: { toggle: "camera" } },
    ]);
    first();
    expect(app.commands.enabled("google.toggleMeetCamera")).toBeFalsy();
  });
});
