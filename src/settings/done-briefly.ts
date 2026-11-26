import { useCallback, useEffect, useRef, useState } from "react";

/** How long a button shows that it did what it was pressed for. */
const DONE_FOR = 2000;

/**
 * Whether a button shows its done state, and the call that shows it for two
 * seconds, again from the start when called while shown.
 */
export const useDoneBriefly = () => {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const showDone = useCallback(() => {
    clearTimeout(timer.current);
    setDone(true);
    timer.current = setTimeout(() => {
      setDone(false);
    }, DONE_FOR);
  }, []);

  return [done, showDone] as const;
};
