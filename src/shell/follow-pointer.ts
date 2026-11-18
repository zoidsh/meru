/**
 * Follows a pressed pointer through the window until it is let go, for a
 * drag. On Linux and Windows, Chromium makes up a move where the system's
 * cursor is when the views under it change size, as they do under a drag,
 * carrying the buttons the system holds; a press the system did not see,
 * as one sent through the DevTools protocol, then reads as let go and the
 * element's capture ends. So the window is listened to rather than the
 * element, and moves with no button held end the drag only when they come
 * from two places, since every made-up move comes from the one place the
 * system's cursor rests, while a pointer let go where the shell did not hear
 * it moves on. No clock decides it, so a slow machine cannot end a drag
 * whose held moves come late.
 *
 * `target` is the window; `lost` is a release that never reached the
 * shell, or the system taking the pointer away. Returns the function that
 * stops following.
 */
export const followPointer = (
  target: EventTarget,
  pointerId: number,
  {
    move,
    up,
    lost,
  }: {
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    lost: () => void;
  }
) => {
  /** Where the first move with no button held since the last held one came from. */
  let loose: { x: number; y: number } | undefined;

  const isOurs = (event: Event): event is PointerEvent =>
    (event as PointerEvent).pointerId === pointerId;

  const onMove = (event: Event) => {
    if (!isOurs(event)) {
      return;
    }

    if (event.buttons !== 0) {
      loose = undefined;
      move(event);

      return;
    }

    if (!loose) {
      loose = { x: event.clientX, y: event.clientY };
    } else if (loose.x !== event.clientX || loose.y !== event.clientY) {
      loose = undefined;
      lost();
    }
  };

  const onUp = (event: Event) => {
    if (isOurs(event)) {
      up(event);
    }
  };

  const onCancel = (event: Event) => {
    if (isOurs(event)) {
      lost();
    }
  };

  target.addEventListener("pointermove", onMove, true);
  target.addEventListener("pointerup", onUp, true);
  target.addEventListener("pointercancel", onCancel, true);

  return () => {
    target.removeEventListener("pointermove", onMove, true);
    target.removeEventListener("pointerup", onUp, true);
    target.removeEventListener("pointercancel", onCancel, true);
  };
};
