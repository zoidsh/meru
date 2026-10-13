"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "../lib/utils";

function ScrollArea({
  className,
  children,
  viewportTabIndex,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** `-1` keeps a scroller out of the tab order even when nothing inside it is focusable. */
  viewportTabIndex?: number;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      {/*
       * Base UI gives a scrollable viewport `tabIndex={0}`, which puts a stop in
       * front of whatever it holds. Chromium already makes a scroller focusable
       * on its own, and only when nothing inside it is, so it is left to decide:
       * the settings nav hands Tab straight to its items, while a viewport of
       * plain text can still be scrolled from the keyboard.
       *
       * Passing `undefined` is what takes Base UI's value off, because its
       * `mergeProps` treats an explicit `undefined` as a value rather than as
       * nothing to merge. `scroll-area.test.ts` holds it to that.
       */}
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        tabIndex={viewportTabIndex}
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
