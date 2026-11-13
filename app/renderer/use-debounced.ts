import { useEffect, useMemo, useRef } from "react";

/** `run` called `wait` milliseconds after the last call, with that call's arguments; a call still waiting when the component goes is dropped. */
export const useDebounced = <A extends readonly unknown[]>(
  run: (...args: A) => void,
  wait: number
): ((...args: A) => void) => {
  const latest = useRef(run);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    []
  );
  return useMemo(
    () =>
      (...args: A) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          latest.current(...args);
        }, wait);
      },
    [wait]
  );
};
