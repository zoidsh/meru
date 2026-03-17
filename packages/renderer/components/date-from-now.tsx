import { date } from "@meru/renderer-lib/date";
import { useEffect, useState } from "react";

export function DateFromNow({
  timestamp,
}: { timestamp: number } & React.HTMLAttributes<HTMLDivElement>) {
  const [timeAgo, setTimeAgo] = useState(date.unix(timestamp).fromNow());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(date.unix(timestamp).fromNow());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [timestamp]);

  return timeAgo;
}
