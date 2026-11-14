import { act } from "react";
import { describe, expect, it } from "vitest";

import type { UpdateState } from "../../../core/records/update.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { updater, updaterPushes } from "../../../shared/channels/updater.ts";
import { answer, mountSettings } from "../../testing.tsx";
import { UpdateStatus } from "./update-status.tsx";

const mount = (state: UpdateState) =>
  mountSettings(<UpdateStatus />, [
    answer(updater.snapshot, state),
    answer(commands.run, null),
    answer(updater.check, null),
  ]);

const button = () => document.querySelector("button");

const shown = () => ({
  button: button()?.textContent,
  disabled: button()?.disabled,
  status: document.querySelector("[data-update]")?.textContent,
});

const click = async () => {
  await act(async () => {
    button()?.click();
    await Promise.resolve();
  });
};

describe(UpdateStatus, () => {
  it("checks for updates from idle", async () => {
    const { sentOn } = mount({ kind: "idle" });
    const idle = shown();
    await click();
    expect({ idle, sent: sentOn(updater.check) }).toStrictEqual({
      idle: {
        button: "Check for updates",
        disabled: false,
        status: "Meru checks for updates in the background.",
      },
      sent: [{}],
    });
  });

  it("follows the updater, holding the button while it checks or downloads, and restarts to install once an update is ready", async () => {
    const { push, sentOn } = mount({ kind: "idle" });
    push(updaterPushes.changed, { kind: "checking" });
    const checking = shown();
    push(updaterPushes.changed, { kind: "downloading", percent: 42.4 });
    const downloading = shown();
    push(updaterPushes.changed, { kind: "ready", version: "4.0.1" });
    const ready = shown();
    await click();
    expect({
      checking,
      downloading,
      ready,
      sent: sentOn(commands.run),
    }).toStrictEqual({
      checking: {
        button: "Check for updates",
        disabled: true,
        status: "Checking for updates…",
      },
      downloading: {
        button: "Check for updates",
        disabled: true,
        status: "Downloading the update, 42%…",
      },
      ready: {
        button: "Restart to update",
        disabled: false,
        status: "Meru 4.0.1 is ready. Restart Meru to update.",
      },
      sent: [{ id: "updater.install" }],
    });
  });

  it("says updates come only to an installed Meru when main refuses the check as not packaged", async () => {
    mountSettings(<UpdateStatus />, [
      answer(updater.snapshot, { kind: "idle" }),
      answer(updater.check, "notPackaged"),
    ]);
    await click();
    expect(
      document.querySelector("[data-update]")?.nextElementSibling?.textContent
    ).toBe("Updates come only to an installed Meru.");
  });
});
