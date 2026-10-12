/**
 * Windows and Linux open an application menu from the keyboard with F10, or by
 * pressing and releasing Alt on its own. The second one is a gesture rather
 * than a shortcut: it only counts when nothing happened between the press and
 * the release, so Alt+Tab, Alt+F and the Ctrl+Alt that AltGr sends all have to
 * pass through untouched.
 */
export type AppMenuKeyInput = {
  type: string;
  key?: string;
  control?: boolean;
  shift?: boolean;
  meta?: boolean;
  isAutoRepeat?: boolean;
  isComposing?: boolean;
};

/** Whether a bare Alt is still down with nothing having happened since. */
export type AppMenuKeyState = "idle" | "altHeldAlone";

export function readAppMenuKey(
  state: AppMenuKeyState,
  input: AppMenuKeyInput,
): { state: AppMenuKeyState; opensMenu: boolean } {
  // Alt+click is a drag or a modified click, not a reach for the menu, and it
  // is what Chromium's own menu bar disarms on too.
  if (input.type === "mouseDown") {
    return { state: "idle", opensMenu: false };
  }

  // Keys being fed to an input method belong to the text being composed, and
  // the Alt they may carry is the method's, not a reach for the menu.
  if (input.isComposing) {
    return { state: "idle", opensMenu: false };
  }

  if (input.type === "keyDown") {
    if (input.key === "F10" && !input.control && !input.shift && !input.meta) {
      return { state: "idle", opensMenu: true };
    }

    const isBareAlt =
      input.key === "Alt" && !input.control && !input.shift && !input.meta && !input.isAutoRepeat;

    return { state: isBareAlt ? "altHeldAlone" : "idle", opensMenu: false };
  }

  if (input.type === "keyUp") {
    const opensMenu = state === "altHeldAlone" && input.key === "Alt";

    return { state: "idle", opensMenu };
  }

  return { state, opensMenu: false };
}
