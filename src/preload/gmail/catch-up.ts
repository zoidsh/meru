import { findHook, guardedSelector } from "#core/gmail-hooks.ts";

const REFRESH = findHook("refresh");

const PRESS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];

// Gmail clears the control's pressed look only on these, which no real
// pointer is there to send.
const LEAVE = ["pointerout", "pointerleave", "mouseout", "mouseleave"];

const eventOf = (type: string, init: MouseEventInit) =>
  type.startsWith("pointer")
    ? new PointerEvent(type, init)
    : new MouseEvent(type, init);

/** An HTML or SVG element, either of which can hold focus. */
const focusable = (
  element: Element | null
): element is Element & HTMLOrSVGElement =>
  element !== null && "focus" in element && "blur" in element;

/** Gmail's Refresh control, never anything in mail or a draft. */
export const findRefresh = (root: ParentNode): Element | undefined => {
  for (const anchor of REFRESH.anchors) {
    const match = root.querySelector(guardedSelector(REFRESH, anchor));

    if (match) {
      return match;
    }
  }

  return undefined;
};

/**
 * Presses Gmail's Refresh, which syncs the page without reloading it, so an
 * open thread, a draft and the list stay as they are. Gmail binds it to the
 * whole pointer and mouse sequence, so `click()` alone does nothing; it
 * focuses the control on mousedown, so focus goes back to where it was. A
 * page without the control is left alone, and its health check says so.
 */
export const pressRefresh = (document: Document) => {
  const control = findRefresh(document);

  if (!control) {
    return false;
  }

  const { left, top, width, height } = control.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: left + width / 2,
    clientY: top + height / 2,
  };
  const focused = document.activeElement;

  for (const type of PRESS) {
    control.dispatchEvent(eventOf(type, init));
  }

  for (const type of LEAVE) {
    control.dispatchEvent(eventOf(type, { ...init, relatedTarget: null }));
  }

  if (document.activeElement === control) {
    if (focusable(focused) && focused !== document.body) {
      focused.focus();
    } else if (focusable(control)) {
      control.blur();
    }
  }

  return true;
};
