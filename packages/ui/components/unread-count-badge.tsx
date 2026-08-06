import { cn } from "../lib/utils";

export function UnreadCountBadge({
  unreadCount,
  className,
}: {
  unreadCount: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#ec3128] px-1 text-[0.5rem] leading-none font-normal text-white",
        className,
      )}
    >
      {unreadCount.toLocaleString()}
    </div>
  );
}
