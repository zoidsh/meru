import { cn } from "cn";
import type { ReactNode } from "react";

import { OVERLAY_WIDTHS, overlayWidth } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";

/**
 * The card every overlay draws in, placed in the view that covers the
 * content area: 64px below its top, centred, as tall as what it holds and
 * at most to 16px above its bottom. A press beside it closes the overlay.
 */
export const OverlayCard = ({
  kind,
  labelledBy,
  className,
  children,
}: {
  kind: Overlay["kind"];
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className="pointer-events-none fixed inset-x-0 top-16 bottom-4 flex items-start justify-center px-2">
    {/* Open but not modal: the page beside it stays in view. */}
    <dialog
      open
      aria-labelledby={labelledBy}
      data-overlay-card
      style={{ width: OVERLAY_WIDTHS[overlayWidth({ kind })] }}
      className={cn(
        "pointer-events-auto relative m-0 flex max-h-full max-w-full flex-col overflow-hidden rounded-[14px] border-0 bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
    </dialog>
  </div>
);
