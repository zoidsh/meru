import { useLingui } from "@lingui/react/macro";
import {
  CopyPlusIcon,
  ExternalLinkIcon,
  LinkIcon,
  PinIcon,
  PinOffIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import type { ShellState } from "#contract/shell.ts";
import { TAB_MENU_COMMANDS, TAB_MENU_GROUPS } from "#core/tab-menu.ts";
import type { TabMenuItemId } from "#core/tab-menu.ts";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu.tsx";

import { shellCalls, useShellState } from "./sync.ts";

type TabMenuOverlay = Extract<ShellState["overlay"], { kind: "tab-menu" }>;

const close = () => {
  shellCalls().closeOverlay({});
};

const run = (item: TabMenuItemId) => {
  shellCalls().runTabMenuItem({ item });
};

/**
 * A tab's context menu, drawn open in the overlay's document, whose view
 * covers the window's content area: shadcn's dropdown menu, since it opens
 * where its trigger is, and here its trigger is an empty mark at the point,
 * the one in the shell's document being out of its reach. Its content is
 * portalled through an outer portal into this document, since Base UI's own
 * would go to the shell's.
 */
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
    group.flatMap((id) => offered.get(id) ?? [])
  ).filter((group) => group.length > 0);

  return (
    <DropdownMenu
      open
      onOpenChange={(open, { reason }) => {
        // A chosen item is main's to act on, and main closes the menu after,
        // so focus goes back to the tab as it is then.
        if (!open && reason !== "item-press") {
          close();
        }
      }}
    >
      <DropdownMenuTrigger
        render={<span aria-hidden />}
        nativeButton={false}
        tabIndex={-1}
        className="pointer-events-none fixed size-0"
        style={{ left: menu.x, top: menu.y }}
      />
      <DropdownMenuPortal container={target.body}>
        <DropdownMenuContent
          aria-label={menu.title}
          // A press here is the menu's own, which the overlay's closer leaves.
          data-overlay-card
          // Main gives focus back to the tab when the overlay closes.
          finalFocus={false}
          sideOffset={0}
          className="w-auto min-w-56"
        >
          {groups.map((group, index) => (
            <Fragment key={group[0]?.id}>
              {index > 0 && <DropdownMenuSeparator />}
              {group.map(({ id, enabled, checked }) => {
                const { icon, text } = label(id);
                const command = TAB_MENU_COMMANDS[id];
                const shortcut = command && shortcuts?.[command];

                return checked === undefined ? (
                  <DropdownMenuItem
                    key={id}
                    disabled={!enabled}
                    inset={!icon}
                    aria-keyshortcuts={
                      command ? ariaShortcuts?.[command] : undefined
                    }
                    onClick={() => {
                      run(id);
                    }}
                  >
                    {icon}
                    {text}
                    {shortcut && (
                      <DropdownMenuShortcut aria-hidden>
                        {shortcut}
                      </DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={checked}
                    disabled={!enabled}
                    inset
                    onCheckedChange={() => {
                      run(id);
                    }}
                  >
                    {text}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
