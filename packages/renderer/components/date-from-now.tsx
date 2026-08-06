import { useEffect, useState } from "react";
import { dayjs } from "@/lib/date";

export function DateFromNow({
  timestamp,
}: { timestamp: number } & React.HTMLAttributes<HTMLDivElement>) {
  const [timeAgo, setTimeAgo] = useState(dayjs.unix(timestamp).fromNow());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(dayjs.unix(timestamp).fromNow());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [timestamp]);

  return timeAgo;
}
