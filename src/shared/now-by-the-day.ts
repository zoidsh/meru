import { useEffect, useState } from "react";

/**
 * Tells `onDay` the time at each local midnight, and again whenever the
 * window is shown or focused: a timer does not count time the computer spent
 * asleep, so after a wake it would fire late and "tomorrow" read stale until
 * then. Returns a stop.
 */
export const followDays = (
  {
    window,
    document,
  }: {
    window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
    document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
      visibilityState: DocumentVisibilityState;
    };
  },
  onDay: (now: number) => void
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = () => {
    clearTimeout(timer);

    const today = new Date();
    const midnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    timer = setTimeout(() => {
      onDay(Date.now());
      arm();
    }, midnight.getTime() - today.getTime());
  };
  const again = () => {
    onDay(Date.now());
    arm();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      again();
    }
  };

  arm();
  window.addEventListener("focus", again);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", again);
    document.removeEventListener("visibilitychange", onVisible);
  };
};

/**
 * Now, taken again at each local midnight and as the window comes back,
 * enough to tell today's end from tomorrow's.
 */
export const useNowByTheDay = () => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => followDays({ window, document }, setNow), []);

  return now;
};
