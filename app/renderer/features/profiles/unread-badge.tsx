import { cn } from "cn";

/** The red count Gmail's unread mail shows as, on a profile's button and on the Gmail row. */
export const UnreadBadge = ({
  count,
  className,
}: {
  readonly count: number;
  readonly className?: string;
}) => (
  <span
    className={cn(
      "flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#ec3128] px-1 text-[0.5rem] leading-none font-normal text-white",
      className
    )}
    data-unread-badge=""
  >
    {count.toLocaleString()}
  </span>
);
