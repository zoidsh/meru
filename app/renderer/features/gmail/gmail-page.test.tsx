import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { commands } from "../../../shared/channels/commands.ts";
import { settings } from "../../../shared/channels/settings.ts";
import type { Locked } from "../../../shared/settings/schema.ts";
import { answer, mountSettings, typeInto } from "../../testing.tsx";
import { GmailPage } from "./gmail-page.tsx";

const WORK = { color: "#1a73e8", label: "Work", textColor: "auto" } as const;

const mount = (locked: Locked = {}) =>
  mountSettings(<GmailPage />, [
    answer(settings.snapshot, {
      layers: { global: { "gmail.labelColors": [WORK] }, profiles: {} },
      locked,
    }),
    answer(settings.set, null),
    answer(commands.run, null),
  ]);

const section = () =>
  document.querySelector<HTMLElement>('[data-setting="gmail.labelColors"]');

const rows = () => [
  ...(section()?.querySelectorAll<HTMLElement>("li[data-label-color]") ?? []),
];

/** The name fields of every row, the add row's last. */
const names = () => [
  ...(section()?.querySelectorAll<HTMLInputElement>(
    "input:not([type=color])"
  ) ?? []),
];

const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (found) => found.textContent === text
  );

const click = (element: Element | null | undefined) => {
  act(() => {
    if (element instanceof HTMLElement) {
      element.click();
    }
  });
};

const pause = () => {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
};

describe(GmailPage, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists every label colour and adds one, with its colour and auto text, through settings.set", () => {
    const { sentOn } = mount();
    const empty = button("Add label color")?.disabled;
    typeInto(names().at(-1), "Travel");
    click(button("Add label color"));
    expect({
      empty,
      listed: rows().map((row) => row.dataset.labelColor),
      sent: sentOn(settings.set),
    }).toStrictEqual({
      empty: true,
      listed: ["Work"],
      sent: [
        {
          key: "gmail.labelColors",
          value: [
            WORK,
            { color: "#1a73e8", label: "Travel", textColor: "auto" },
          ],
        },
      ],
    });
  });

  it("writes a renamed label once typing pauses, and nothing while the name is empty", () => {
    vi.useFakeTimers();
    const { sentOn } = mount();
    typeInto(names()[0], "Office");
    const typing = sentOn(settings.set);
    pause();
    const renamed = sentOn(settings.set);
    typeInto(names()[0], "   ");
    pause();
    expect({ emptied: sentOn(settings.set), renamed, typing }).toStrictEqual({
      emptied: renamed,
      renamed: [
        {
          key: "gmail.labelColors",
          value: [{ color: "#1a73e8", label: "Office", textColor: "auto" }],
        },
      ],
      typing: [],
    });
  });

  it("picks a label's text colour and removes its row, each written at once", async () => {
    const { sentOn } = mount();
    click(rows()[0]?.querySelector("button[data-slot=select-trigger]"));
    await act(async () => {
      await Promise.resolve();
    });
    click(
      [...document.querySelectorAll("[role=option]")].find(
        (option) => option.textContent === "White"
      )
    );
    click(button("Remove"));
    expect(sentOn(settings.set)).toStrictEqual([
      {
        key: "gmail.labelColors",
        value: [{ color: "#1a73e8", label: "Work", textColor: "white" }],
      },
      { key: "gmail.labelColors", value: [] },
    ]);
  });

  it("says why the gate locks the label colours and lets nothing change while it does", () => {
    mount({ "gmail.labelColors": "free" });
    expect({
      add: button("Add label color")?.disabled,
      editor: button("Open in editor")?.disabled,
      folder: button("Show in folder")?.disabled,
      listed: rows().length,
      name: names().at(-1)?.disabled,
      reason: section()?.querySelector("[data-locked]")?.textContent,
    }).toStrictEqual({
      add: true,
      editor: true,
      folder: true,
      listed: 0,
      name: true,
      reason: "Upgrade to Meru Pro to unlock this.",
    });
  });

  it("opens the user styles in the editor and shows them in their folder, each as its command", () => {
    const { sentOn } = mount();
    click(button("Open in editor"));
    click(button("Show in folder"));
    expect(sentOn(commands.run)).toStrictEqual([
      { id: "gmail.editUserStyles" },
      { id: "gmail.revealUserStyles" },
    ]);
  });
});
