/**
 * How long a move with no button held waits for a move with one, or a
 * release, before the drag counts its release as lost.
 */
const RELEASE_GRACE = 150;

/**
 * Follows a pressed pointer through the window until it is let go, for a
 * drag. On Linux and Windows, Chromium makes up a move where the system's
 * cursor is when the views under it change size, as they do under a drag,
 * carrying the buttons the system holds; a press the system did not see,
 * as one sent through the DevTools protocol, then reads as let go and the
 * element's capture ends. So the window is listened to rather than the
 * element, and a move with no button held ends the drag only when no move
 * with one, nor a release, comes soon after.
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
  let released: ReturnType<typeof setTimeout> | undefined;

  const isOurs = (event: Event): event is PointerEvent =>
    (event as PointerEvent).pointerId === pointerId;

  const settle = () => {
    clearTimeout(released);
    released = undefined;
  };

  const onMove = (event: Event) => {
    if (!isOurs(event)) {
      return;
    }

    if (event.buttons === 0) {
      if (released === undefined) {
        released = setTimeout(() => {
          released = undefined;
          lost();
        }, RELEASE_GRACE);
      }

      return;
    }

    settle();
    move(event);
  };

  const onUp = (event: Event) => {
    if (isOurs(event)) {
      settle();
      up(event);
    }
  };

  const onCancel = (event: Event) => {
    if (isOurs(event)) {
      settle();
      lost();
    }
  };

  target.addEventListener("pointermove", onMove, true);
  target.addEventListener("pointerup", onUp, true);
  target.addEventListener("pointercancel", onCancel, true);

  return () => {
    settle();
    target.removeEventListener("pointermove", onMove, true);
    target.removeEventListener("pointerup", onUp, true);
    target.removeEventListener("pointercancel", onCancel, true);
  };
};
