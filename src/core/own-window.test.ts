import { describe, expect, it } from "vitest";

import { OVERLAY_FRAME_NAME } from "./overlay.ts";
import {
  ownWindowCardFrameName,
  ownWindowDocumentWanted,
  ownWindowFindFrameName,
  ownWindowFrameName,
} from "./own-window.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";

const OPEN = { profileId: "p", tabId: "open" };
const CLOSED = { profileId: "p", tabId: "closed" };

const isOpen = (key: TabKey) => tabKey(key) === tabKey(OPEN);

describe(ownWindowDocumentWanted, () => {
  it("takes a titlebar, find bar or card only for a window that is open", () => {
    const names = [
      ownWindowFrameName,
      ownWindowFindFrameName,
      ownWindowCardFrameName,
    ];

    expect([
      names.map((name) => ownWindowDocumentWanted(name(OPEN), isOpen)),
      names.map((name) => ownWindowDocumentWanted(name(CLOSED), isOpen)),
    ]).toStrictEqual([
      [true, true, true],
      [false, false, false],
    ]);
  });

  it("leaves every other name to the rules that decide it", () => {
    expect(
      [OVERLAY_FRAME_NAME, "another-name", ""].map((name) =>
        ownWindowDocumentWanted(name, () => false)
      )
    ).toStrictEqual([true, true, true]);
  });
});
