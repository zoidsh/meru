import type { ReactNode } from "react";

import { OVERLAY_WIDTHS, overlayWidth } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#ui/card.tsx";

/**
 * An overlay with a title, drawn as shadcn's Card at its default size and
 * placed as every overlay is: 64px below the view's top, centred, at most to
 * 16px above its bottom. A press beside it closes the overlay.
 */
export const TitledOverlay = ({
  kind,
  title,
  titleId,
  beside,
  action,
  children,
}: {
  kind: Overlay["kind"];
  title: ReactNode;
  titleId: string;
  /** Shown right after the title, as a count of what the list holds. */
  beside?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) => (
  // Sized as a container, so the list inside can take the height the Card
  // leaves it.
  <div className="[container-type:size] pointer-events-none fixed inset-x-0 top-16 bottom-4 flex items-start justify-center px-2">
    {/* Open but not modal: the page beside it stays in view. */}
    <dialog
      open
      aria-labelledby={titleId}
      data-overlay-card
      style={{ width: OVERLAY_WIDTHS[overlayWidth({ kind })] }}
      className="pointer-events-auto relative m-0 max-w-full border-0 bg-transparent p-0 text-card-foreground"
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <h2 id={titleId}>{title}</h2>
              {beside}
            </span>
          </CardTitle>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </dialog>
  </div>
);

/**
 * What a titled overlay holds: as tall as its content and at most the room
 * the Card leaves, reaching out of CardContent's padding and the Card's
 * below to 8px from the Card's edge so a row's fill sits there. The room left
 * is the Card's padding above, the 8px below, its gap and its header beside a
 * 24px action.
 */
export const TitledOverlayBody = ({ children }: { children: ReactNode }) => (
  <div className="-mx-2 -mb-2 flex max-h-[calc(100cqh-66px)] min-h-0 flex-col">
    {children}
  </div>
);
