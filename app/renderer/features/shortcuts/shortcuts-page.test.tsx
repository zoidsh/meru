import { act } from "react";
import { describe, expect, it } from "vitest";

import { settings } from "../../../shared/channels/settings.ts";
import { shortcuts } from "../../../shared/channels/shortcuts.ts";
import { commands } from "../../../shared/commands/registry.ts";
import { answer, mountSettings } from "../../testing.tsx";
import { ShortcutsPage } from "./shortcuts-page.tsx";

const mount = (bindings: Readonly<Record<string, string | null>> = {}) => {
  const page = mountSettings(<ShortcutsPage />, [
    answer(settings.snapshot, {
      layers: {
        global: { "shortcuts.bindings": bindings },
        profiles: {},
      },
      locked: {},
    }),
    answer(settings.set, null),
  ]);
  return page;
};

const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-command="${id}"]`);

const recorder = (id: string) =>
  row(id)?.querySelector<HTMLButtonElement>("[aria-label^='Shortcut for']");

const press = (
  target: HTMLElement | null | undefined,
  init: KeyboardEventInit
) => {
  act(() => {
    target?.click();
  });
  act(() => {
    target?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
    );
  });
};

describe(ShortcutsPage, () => {
  it("lists every command once, each under its feature", () => {
    mount();
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-command]")]
        .map((found) => found.dataset.command ?? "")
        .toSorted((a, b) => a.localeCompare(b))
    ).toStrictEqual(
      commands
        .map((command) => command.id)
        .toSorted((a, b) => a.localeCompare(b))
    );
  });

  it("records the next key pressed on a shortcut into shortcuts.bindings, in the form that travels between platforms", () => {
    const { sentOn } = mount();
    press(recorder("launcher.open"), {
      code: "KeyK",
      key: "K",
      metaKey: true,
      shiftKey: true,
    });
    expect(sentOn(settings.set)).toStrictEqual([
      {
        key: "shortcuts.bindings",
        value: { "launcher.open": "CommandOrControl+Shift+K" },
      },
    ]);
  });

  it("takes a shortcut away on Backspace, stops on Escape, and resets a binding to the default", () => {
    const { sentOn } = mount({ "stage.reload": "CmdOrCtrl+Shift+R" });
    press(recorder("launcher.open"), { code: "Escape", key: "Escape" });
    press(recorder("launcher.open"), { code: "Backspace", key: "Backspace" });
    act(() => {
      [...(row("stage.reload")?.querySelectorAll("button") ?? [])]
        .find((button) => button.textContent === "Reset")
        ?.click();
    });
    expect(sentOn(settings.set)).toStrictEqual([
      {
        key: "shortcuts.bindings",
        value: { "launcher.open": null, "stage.reload": "CmdOrCtrl+Shift+R" },
      },
      { key: "shortcuts.bindings", value: {} },
    ]);
  });

  it("tells main while it records, so the menu leaves the keys to the page", () => {
    const { sentOn } = mount();
    const button = recorder("launcher.open");
    act(() => {
      button?.click();
    });
    const started = sentOn(shortcuts.recording);
    press(button, { code: "KeyK", key: "K", metaKey: true });
    expect([started, sentOn(shortcuts.recording)]).toStrictEqual([
      [{ recording: true }],
      [{ recording: true }, { recording: false }],
    ]);
  });

  it("marks the commands a binding gives the same keys as another's", () => {
    mount({ "launcher.open": "CmdOrCtrl+R" });
    expect(
      [...document.querySelectorAll("[data-conflict]")].map(
        (found) => found.closest<HTMLElement>("[data-command]")?.dataset.command
      )
    ).toStrictEqual(["launcher.open", "stage.reload"]);
  });
});
