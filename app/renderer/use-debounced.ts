import { useEffect, useMemo, useRef } from "react";

export interface Debounced<A extends readonly unknown[]> {
  /** Calls `run` once `wait` milliseconds pass with no other call, with the last call's arguments. */
  readonly call: (...args: A) => void;
  /** Runs a call still waiting, at once. */
  readonly flush: () => void;
}

interface Waiting<A> {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly args: A;
}

/** `run` debounced by `wait` milliseconds; a call still waiting runs when `flush` is called or the component goes, so leaving a field never loses what was typed. */
export const useDebounced = <A extends readonly unknown[]>(
  run: (...args: A) => void,
  wait: number
): Debounced<A> => {
  const latest = useRef(run);
  const waiting = useRef<Waiting<A> | undefined>(undefined);
  useEffect(() => {
    latest.current = run;
  });
  const debounced = useMemo(
    () => ({
      call: (...args: A) => {
        clearTimeout(waiting.current?.timer);
        waiting.current = {
          args,
          timer: setTimeout(() => {
            waiting.current = undefined;
            latest.current(...args);
          }, wait),
        };
      },
      flush: () => {
        const found = waiting.current;
        if (found !== undefined) {
          clearTimeout(found.timer);
          waiting.current = undefined;
          latest.current(...found.args);
        }
      },
    }),
    [wait]
  );
  useEffect(
    () => () => {
      debounced.flush();
    },
    [debounced]
  );
  return debounced;
};
