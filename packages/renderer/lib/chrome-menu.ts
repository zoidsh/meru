import { ipc } from "@meru/shared/renderer/ipc";

/**
 * What a menu whose trigger sits in the window chrome passes to its root, its
 * trigger and its content.
 *
 * Two things keep the trigger from holding the keyboard, and it needs both.
 * Base UI gives a menu trigger its own `tabIndex`, which lands after the one
 * the button underneath asks for and puts it back in the Tab sequence. And
 * when a menu closes — Escape, an item chosen, a click outside — Base UI hands
 * focus back to the trigger, which is right for a menu inside a page and wrong
 * in the chrome, where it leaves a titlebar button wearing a focus ring at the
 * next key press, over a view that looks in front.
 *
 * So the trigger stays out of the Tab order, it does not take focus back, and
 * the account's view takes it instead.
 */
export function useChromeMenu(isOpen: boolean, onOpenChange: (isOpen: boolean) => void) {
  return {
    rootProps: {
      open: isOpen,
      onOpenChange: (open: boolean) => {
        onOpenChange(open);

        if (!open) {
          ipc.main.send("window.focusActiveView");
        }
      },
    },
    triggerProps: { tabIndex: -1 },
    contentProps: { finalFocus: false as const },
  };
}
