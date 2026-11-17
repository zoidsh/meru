import { cn } from "cn";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import { TOOLTIP_FRAME_NAME } from "#core/overlay.ts";
import { tooltipRectangle, tooltipViewBounds } from "#core/tooltip.ts";
import type { TooltipSide } from "#core/tooltip.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import { Tooltip } from "#ui/tooltip.tsx";

import { openShellDocument } from "./shell-document.ts";
import { shellCalls } from "./sync.ts";

interface Opened {
  open: boolean;
  /** The trigger it opened for, which it is placed beside. */
  anchor: Element | undefined;
}

const OpenedContext = createContext<Opened>({ open: false, anchor: undefined });

/**
 * shadcn's Tooltip, with Base UI's timing and triggers, drawn where it can
 * be seen: one whose trigger is in the shell's own document goes in the
 * tooltips' view above the page, which main sizes to it; one in an overlay
 * is drawn in the overlay's document. Its trigger is `TooltipTrigger`, its
 * content `ShellTooltipContent`.
 */
export const ShellTooltip = ({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: ReactNode;
}) => {
  const [opened, setOpened] = useState<Opened>({
    open: false,
    anchor: undefined,
  });

  return (
    <Tooltip
      disabled={disabled}
      open={opened.open}
      onOpenChange={(open, { trigger }) => {
        setOpened((previous) => ({
          open,
          anchor: trigger ?? previous.anchor,
        }));
      }}
    >
      <OpenedContext value={opened}>{children}</OpenedContext>
    </Tooltip>
  );
};

/** Which box shows the tooltips' view, so a late close hides only its own. */
let showing: string | undefined;

const arrowStyle = (
  side: TooltipSide,
  anchor: Rectangle,
  box: Rectangle
): CSSProperties => {
  const alongX = anchor.x + anchor.width / 2 - box.x - 5;
  const alongY = anchor.y + anchor.height / 2 - box.y - 5;

  switch (side) {
    case "top": {
      return { left: alongX, bottom: -4 };
    }
    case "left": {
      return { top: alongY, right: -4 };
    }
    case "right": {
      return { top: alongY, left: -4 };
    }
    default: {
      return { left: alongX, top: -4 };
    }
  }
};

const SLIDE: Record<TooltipSide, string> = {
  top: "slide-in-from-bottom-2",
  bottom: "slide-in-from-top-2",
  left: "slide-in-from-right-2",
  right: "slide-in-from-left-2",
};

const TooltipBox = ({
  anchor,
  side,
  className,
  children,
}: {
  anchor: Element;
  side: TooltipSide;
  className: string | undefined;
  children: ReactNode;
}) => {
  const id = useId();
  const own = anchor.ownerDocument;
  const inShell = own === document;
  const target = inShell ? openShellDocument(TOOLTIP_FRAME_NAME) : own;
  const boxRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{
    anchor: Rectangle;
    box: Rectangle;
    origin: { x: number; y: number };
  }>();

  useLayoutEffect(() => {
    const box = boxRef.current;
    const view = own.defaultView;

    if (!box || !view) {
      return;
    }

    const place = () => {
      const area = { width: view.innerWidth, height: view.innerHeight };
      const { x, y, width, height } = anchor.getBoundingClientRect();
      const anchorRectangle = { x, y, width, height };
      const rectangle = tooltipRectangle(
        anchorRectangle,
        { width: box.offsetWidth, height: box.offsetHeight },
        side,
        area
      );

      if (inShell) {
        const bounds = tooltipViewBounds(rectangle, area);

        setPlaced({ anchor: anchorRectangle, box: rectangle, origin: bounds });
        showing = id;
        void shellCalls().showTooltip(rectangle);
      } else {
        setPlaced({
          anchor: anchorRectangle,
          box: rectangle,
          origin: { x: 0, y: 0 },
        });
      }
    };
    // Of the document it is drawn in, which may not be this one.
    const observer = new (box.ownerDocument.defaultView ?? view).ResizeObserver(
      place
    );

    place();
    observer.observe(box);

    return () => {
      observer.disconnect();

      if (inShell && showing === id) {
        showing = undefined;
        void shellCalls().hideTooltip({});
      }
    };
  }, [anchor, side, inShell, own, id]);

  if (!target) {
    return null;
  }

  return createPortal(
    <div
      ref={boxRef}
      data-slot="tooltip-content"
      data-side={side}
      style={
        placed
          ? {
              left: placed.box.x - placed.origin.x,
              top: placed.box.y - placed.origin.y,
            }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      className={cn(
        "pointer-events-none fixed z-50 inline-flex w-max max-w-xs animate-in items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background fade-in-0 zoom-in-95 has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
        SLIDE[side],
        className
      )}
    >
      {children}
      {placed && (
        <span
          aria-hidden
          style={arrowStyle(side, placed.anchor, placed.box)}
          className="absolute -z-10 size-2.5 rotate-45 rounded-[2px] bg-foreground"
        />
      )}
    </div>,
    target.body
  );
};

/**
 * What the tooltip says, beside its trigger on `side`; closing takes it
 * away at once.
 */
export const ShellTooltipContent = ({
  side = "top",
  className,
  children,
}: {
  side?: TooltipSide;
  className?: string;
  children: ReactNode;
}) => {
  const { open, anchor } = useContext(OpenedContext);

  if (!open || !anchor) {
    return null;
  }

  return (
    <TooltipBox anchor={anchor} side={side} className={className}>
      {children}
    </TooltipBox>
  );
};
