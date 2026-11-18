import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";

import type { ShellState } from "#contract/shell.ts";

/**
 * What a tab dragged over the pages would do, drawn in the overlay's view
 * over the page area: the half of a pane it would split, tinted and ringed;
 * or the band along the view's edge it would take, darker and dashed;
 * either red with Not enough room where it would leave a pane too small. The
 * drag in the shell keeps the pointer, so this takes none.
 */
export const DropZone = ({
  x,
  y,
  width,
  height,
  along,
  fits,
}: Extract<ShellState["overlay"], { kind: "drop" }>) => {
  const { t } = useLingui();
  let label: string;

  if (!fits) {
    label = t({
      message: "Not enough room",
      comment:
        "Label over the part of the window a tab dragged there would take, when dropping it would leave a pane too small, so it does nothing",
    });
  } else if (along === "pane") {
    label = t({
      message: "Split this pane",
      comment:
        "Label over the half of a pane that lights up while a tab is dragged over it; dropping it puts the tab there beside that pane",
    });
  } else {
    label = t({
      message: "Along the whole view",
      comment:
        "Label over the band along the window's edge that lights up while a tab is dragged near it; dropping it puts the tab there beside every pane",
    });
  }

  return (
    <div
      data-drop-zone={fits ? along : "no-room"}
      style={{ left: x, top: y, width, height }}
      className={cn(
        "pointer-events-none fixed box-border rounded-lg",
        !fits && "bg-destructive/12 inset-ring-2 inset-ring-destructive/60",
        // The page under it keeps its own colours whatever the shell's
        // theme, so a dark fill, which reads over a light page, with a light
        // line, which reads over a dark one.
        fits &&
          along === "pane" &&
          "bg-black/25 inset-ring-2 inset-ring-white/70",
        fits &&
          along === "edge" &&
          "bg-black/35 outline-2 -outline-offset-2 outline-white/85 outline-dashed"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 left-1/2 -translate-1/2 rounded-md bg-popover px-2 py-1 text-xs leading-4 font-medium whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10",
          !fits && "text-destructive"
        )}
      >
        {label}
      </span>
    </div>
  );
};
