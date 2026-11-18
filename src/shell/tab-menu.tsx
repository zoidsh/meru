import { useLingui } from "@lingui/react/macro";
import {
  AppWindowIcon,
  Columns2Icon,
  CopyPlusIcon,
  ExternalLinkIcon,
  LinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelLeftIcon,
  PinIcon,
  PinOffIcon,
  PowerIcon,
  RotateCwIcon,
  Rows2Icon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ShellState } from "#contract/shell.ts";
import { TAB_MENU_COMMANDS, TAB_MENU_GROUPS } from "#core/tab-menu.ts";
import type { TabMenuItemId } from "#core/tab-menu.ts";

import { OverlayMenu } from "./overlay-menu.tsx";
import type { OverlayMenuItem } from "./overlay-menu.tsx";
import { shellCalls, useShellState } from "./sync.ts";

type TabMenuOverlay = Extract<ShellState["overlay"], { kind: "tab-menu" }>;

const run = (item: TabMenuItemId) => {
  shellCalls().runTabMenuItem({ item });
};

/** A tab's context menu, its items in the design's groups. */
export const TabMenu = ({
  menu,
  target,
}: {
  menu: TabMenuOverlay;
  target: Document;
}) => {
  const { t } = useLingui();
  const shortcuts = useShellState("shortcuts");
  const ariaShortcuts = useShellState("ariaShortcuts");
  const offered = new Map(menu.items.map((item) => [item.id, item]));

  const label = (id: TabMenuItemId): { icon?: ReactNode; text: string } => {
    switch (id) {
      case "sleep": {
        return {
          icon: <PowerIcon />,
          text: t({
            message: "Sleep",
            comment:
              "Item of a tab's context menu that frees its page until it is woken, keeping its place",
          }),
        };
      }
      case "wake": {
        return {
          icon: <PowerIcon />,
          text: t({
            message: "Wake",
            comment:
              "Item of a sleeping tab's context menu, in place of Sleep, that loads its page again and selects it",
          }),
        };
      }
      case "reload": {
        return {
          icon: <RotateCwIcon />,
          text: t({
            message: "Reload",
            comment: "Item of a tab's context menu that loads its page again",
          }),
        };
      }
      case "duplicate": {
        return {
          icon: <CopyPlusIcon />,
          text: t({
            message: "Duplicate",
            comment:
              "Item of a tab's context menu that opens another tab of the same app at the same page",
          }),
        };
      }
      case "copyUrl": {
        return {
          icon: <LinkIcon />,
          text: t({
            message: "Copy URL",
            comment:
              "Item of a tab's context menu that copies its page's address",
          }),
        };
      }
      case "openInBrowser": {
        return {
          icon: <ExternalLinkIcon />,
          text: t({
            message: "Open in default browser",
            comment:
              "Item of a tab's context menu that opens its page in the system's web browser",
          }),
        };
      }
      case "pin": {
        return menu.pinned
          ? {
              icon: <PinOffIcon />,
              text: t({
                message: "Unpin",
                comment:
                  "Item of a pinned tab's context menu that unpins it, so it can close",
              }),
            }
          : {
              icon: <PinIcon />,
              text: t({
                message: "Pin",
                comment:
                  "Item of a tab's context menu that pins it to the top of the sidebar, which keeps it from closing",
              }),
            };
      }
      case "openAtLaunch": {
        return {
          text: t({
            message: "Open at Launch",
            comment:
              "Checkbox item of a pinned tab's context menu: whether it loads when Meru starts rather than when first selected",
          }),
        };
      }
      case "splitRight": {
        return {
          icon: <Columns2Icon />,
          text: t({
            message: "Split right",
            comment:
              "Item of a tab's context menu that lists apps to open in a new pane to the right of the tab's",
          }),
        };
      }
      case "splitDown": {
        return {
          icon: <Rows2Icon />,
          text: t({
            message: "Split down",
            comment:
              "Item of a tab's context menu that lists apps to open in a new pane below the tab's",
          }),
        };
      }
      case "maximize": {
        return {
          icon: <Maximize2Icon />,
          text: t({
            message: "Maximize pane",
            comment:
              "Item of a tab's context menu in a split view that shows the tab's pane alone, keeping the split",
          }),
        };
      }
      case "restore": {
        return {
          icon: <Minimize2Icon />,
          text: t({
            message: "Restore panes",
            comment:
              "Item of a tab's context menu, in place of Maximize pane while one pane shows alone, that shows every pane of the split again",
          }),
        };
      }
      case "separate": {
        return {
          icon: <UnlinkIcon />,
          text: t({
            message: "Separate from split",
            comment:
              "Item of a tab's context menu that takes it out of the split view, to show alone",
          }),
        };
      }
      case "moveToNewWindow": {
        return {
          icon: <AppWindowIcon />,
          text: t({
            message: "Move to new window",
            comment:
              "Item of a tab's context menu that moves its page into a window of its own, the tab staying in the sidebar",
          }),
        };
      }
      case "moveToMainWindow": {
        return {
          icon: <PanelLeftIcon />,
          text: t({
            message: "Move to main window",
            comment:
              "Item of a tab's context menu, for a tab in a window of its own, that puts its page back in the main window and closes that window",
          }),
        };
      }
      case "close": {
        return {
          icon: <XIcon />,
          text: t({
            message: "Close tab",
            comment: "Item of a tab's context menu that closes it",
          }),
        };
      }
      case "closeOthers": {
        return {
          text: t({
            message: "Close other tabs",
            comment:
              "Item of a tab's context menu that closes every other tab of the profile but pinned ones",
          }),
        };
      }
      default: {
        return {
          text: t({
            message: "Close tabs below",
            comment:
              "Item of a tab's context menu that closes the tabs below it in the sidebar but pinned ones",
          }),
        };
      }
    }
  };

  const groups = TAB_MENU_GROUPS.map((group) =>
    group.flatMap((id): OverlayMenuItem<TabMenuItemId>[] => {
      const item = offered.get(id);
      const command = TAB_MENU_COMMANDS[id];

      return item
        ? [
            {
              ...item,
              ...label(id),
              shortcut: command && shortcuts?.[command],
              ariaShortcut: command && ariaShortcuts?.[command],
            },
          ]
        : [];
    })
  );

  return (
    <OverlayMenu
      title={menu.title}
      x={menu.x}
      y={menu.y}
      groups={groups}
      target={target}
      run={run}
    />
  );
};
