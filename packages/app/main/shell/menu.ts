import type { Result } from "../../core/result.ts";
import type { Stages } from "../features/stage/index.ts";
import type { MenuSection } from "../platform/menu.ts";

export const MENU_IDS = {
  closePane: "close-pane",
  splitHorizontally: "split-horizontally",
  splitVertically: "split-vertically",
};

export const buildMenu = (options: {
  readonly platform: string;
  readonly stages: Stages;
  readonly onFailure: (action: string, error: string) => void;
}): MenuSection[] => {
  const { platform, stages, onFailure } = options;
  const report =
    (action: string, run: (windowId: number) => Result<undefined, string>) =>
    (windowId: number | undefined) => {
      if (windowId === undefined) {
        return;
      }
      const result = run(windowId);
      if (!result.ok) {
        onFailure(action, result.error);
      }
    };
  return [
    platform === "darwin"
      ? { kind: "role", role: "appMenu" }
      : { kind: "role", role: "fileMenu" },
    { kind: "role", role: "editMenu" },
    {
      entries: [
        {
          accelerator: "CommandOrControl+D",
          id: MENU_IDS.splitVertically,
          kind: "action",
          label: "Split vertically",
          run: report(MENU_IDS.splitVertically, (windowId) =>
            stages.split(windowId, "vertical")
          ),
        },
        {
          accelerator: "CommandOrControl+Shift+D",
          id: MENU_IDS.splitHorizontally,
          kind: "action",
          label: "Split horizontally",
          run: report(MENU_IDS.splitHorizontally, (windowId) =>
            stages.split(windowId, "horizontal")
          ),
        },
        {
          accelerator: "CommandOrControl+W",
          id: MENU_IDS.closePane,
          kind: "action",
          label: "Close pane",
          run: report(MENU_IDS.closePane, (windowId) => stages.close(windowId)),
        },
      ],
      kind: "submenu",
      label: "View",
    },
  ];
};
