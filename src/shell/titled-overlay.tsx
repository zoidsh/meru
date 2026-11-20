import type { CSSProperties, ReactNode } from "react";

import { OVERLAY_WIDTHS, overlayWidth } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#ui/card.tsx";

/**
 * The header's height: the title's line, under it the header's gap and the
 * description's line, or beside an action alone that action's 28px.
 */
const headerHeight = (description: boolean, action: boolean) => {
  if (description) {
    return 46;
  }

  return action ? 28 : 22;
};

/**
 * An overlay with a title, drawn as shadcn's Card at its default size and
 * placed as every overlay is: 64px below the view's top, centred, at most to
 * 16px above its bottom. A press beside it closes the overlay.
 */
export const TitledOverlay = ({
  kind,
  title,
  titleId,
  description,
  action,
  children,
}: {
  kind: Overlay["kind"];
  title: ReactNode;
  titleId: string;
  description?: ReactNode;
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
      style={
        {
          width: OVERLAY_WIDTHS[overlayWidth({ kind })],
          "--titled-header": `${headerHeight(Boolean(description), Boolean(action))}px`,
        } as CSSProperties
      }
      className="pointer-events-auto relative m-0 max-w-full border-0 bg-transparent p-0 text-card-foreground"
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId}>{title}</h2>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
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
 * is the Card's padding above, the 8px below, its gap and its header.
 */
export const TitledOverlayBody = ({ children }: { children: ReactNode }) => (
  <div className="-mx-2 -mb-2 flex max-h-[calc(100cqh-40px-var(--titled-header))] min-h-0 flex-col">
    {children}
  </div>
);
