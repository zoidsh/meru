import { useEffect, useState } from "react";

/**
 * Now, taken again at each local midnight, enough to tell today's end from
 * tomorrow's with one timer a day.
 */
export const useNowByTheDay = () => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const today = new Date();
      const midnight = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );

      timer = setTimeout(() => {
        setNow(Date.now());
        arm();
      }, midnight.getTime() - today.getTime());
    };

    arm();

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return now;
};
