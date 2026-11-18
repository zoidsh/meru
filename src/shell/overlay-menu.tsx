import { Fragment } from "react";
import type { ReactNode } from "react";

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

import { shellCalls } from "./sync.ts";

export interface OverlayMenuItem<Id extends string = string> {
  id: Id;
  text: string;
  icon?: ReactNode | undefined;
  enabled: boolean;
  /** For a checkbox item, whether it is on. */
  checked?: boolean | undefined;
  /** Its shortcut as shown, and as `aria-keyshortcuts` names it. */
  shortcut?: string | undefined;
  ariaShortcut?: string | undefined;
}

// The prototype's corners and muted icons, and its tick on the left in the
// icon slot, where shadcn's checkbox item has it on the right.
const ITEM = "rounded-md [&_svg]:text-muted-foreground";
const CHECKBOX_ITEM = `${ITEM} pr-2 *:data-[slot=dropdown-menu-checkbox-item-indicator]:right-auto *:data-[slot=dropdown-menu-checkbox-item-indicator]:left-2`;

/**
 * A context menu drawn open in the overlay's document, whose view covers the
 * window's content area: shadcn's dropdown menu, since it opens where its
 * trigger is, and here its trigger is an empty mark at the point, the one in
 * the shell's document being out of its reach. Its content is portalled
 * through an outer portal into this document, since Base UI's own would go to
 * the shell's. Each kind of menu gives its groups of items, drawn with a
 * separator between each, and runs the one chosen through main.
 */
export const OverlayMenu = <Id extends string>({
  title,
  x,
  y,
  groups,
  target,
  run,
}: {
  /** Names the menu for assistive technology. */
  title: string;
  x: number;
  y: number;
  groups: readonly (readonly OverlayMenuItem<Id>[])[];
  target: Document;
  run: (id: Id) => void;
}) => (
  <DropdownMenu
    open
    onOpenChange={(open, { reason }) => {
      // A chosen item is main's to act on, and main closes the menu after,
      // so focus goes back to the control as it is then.
      if (!open && reason !== "item-press") {
        shellCalls().closeOverlay({});
      }
    }}
  >
    <DropdownMenuTrigger
      render={<span aria-hidden />}
      nativeButton={false}
      tabIndex={-1}
      className="pointer-events-none fixed size-0"
      style={{ left: x, top: y }}
    />
    <DropdownMenuPortal container={target.body}>
      <DropdownMenuContent
        aria-label={title}
        // A press here is the menu's own, which the overlay's closer leaves.
        data-overlay-card
        // Main gives focus back to the control when the overlay closes.
        finalFocus={false}
        sideOffset={0}
        className="w-auto min-w-56 rounded-lg"
      >
        {groups
          .filter((group) => group.length > 0)
          .map((group, index) => (
            <Fragment key={group[0]?.id}>
              {index > 0 && <DropdownMenuSeparator />}
              {group.map(
                ({
                  id,
                  text,
                  icon,
                  enabled,
                  checked,
                  shortcut,
                  ariaShortcut,
                }) =>
                  checked === undefined ? (
                    <DropdownMenuItem
                      key={id}
                      disabled={!enabled}
                      // shadcn styles the attribute's presence, so an item
                      // with an icon leaves it out rather than set it false.
                      {...(!icon && { inset: true })}
                      className={ITEM}
                      aria-keyshortcuts={ariaShortcut}
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
                      className={CHECKBOX_ITEM}
                      onCheckedChange={() => {
                        run(id);
                      }}
                    >
                      {text}
                    </DropdownMenuCheckboxItem>
                  )
              )}
            </Fragment>
          ))}
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenu>
);
