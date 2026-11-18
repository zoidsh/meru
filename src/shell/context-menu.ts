import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import type { MenuKind } from "#core/overlay.ts";

import { useShellState } from "./sync.ts";

type MenuOverlay<Kind extends MenuKind> = Extract<
  ShellState["overlay"],
  { kind: Kind }
>;

/** Shift+F10 or the Menu key, which open a focused control's menu beside it. */
export const isMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

/** A point of the window in whole CSS pixels, as main takes a menu's. */
export const wholePoint = (x: number, y: number) => ({
  x: Math.max(0, Math.round(x)),
  y: Math.max(0, Math.round(y)),
});

/**
 * Closing a menu gives focus back to the shell, which puts it on the control
 * the menu of `kind` was opened on, named by `subject`, through `restore`,
 * when main gave it focus.
 */
export const useMenuReturn = <Kind extends MenuKind>(
  kind: Kind,
  subject: (menu: MenuOverlay<Kind>) => string,
  restore: (subject: string) => void
) => {
  const overlay = useShellState("overlay");
  const open =
    overlay?.kind === kind ? subject(overlay as MenuOverlay<Kind>) : undefined;
  const last = useRef<string>(undefined);

  useEffect(() => {
    const closed = last.current;

    last.current = open;

    // Main gives the page focus instead when the window lost it or another
    // profile was selected; the shell then has none to place.
    if (open === undefined && closed !== undefined && document.hasFocus()) {
      restore(closed);
    }
  });
};
