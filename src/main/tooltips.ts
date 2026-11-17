import { tooltipViewBounds } from "#core/tooltip.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";
import type { OverlayView } from "#platform/overlay-view.ts";

/**
 * The view the shell's tooltips are drawn in, above the page and any
 * overlay, sized to the one that shows. It is never focused, so a tooltip
 * takes no key from what has them.
 */
export const createTooltips = ({ area }: { area: () => Size }) => {
  let view: OverlayView | undefined;

  return {
    /** Takes the view the shell's tooltip document shows in. */
    adopt: (next: OverlayView) => {
      view = next;
      next.onGone(() => {
        if (view === next) {
          view = undefined;
        }
      });
    },
    /** Shows the view around a tooltip at `rectangle`, kept inside the window. */
    show: (rectangle: Rectangle) => {
      view?.setBounds(tooltipViewBounds(rectangle, area()));
      view?.show();
    },
    hide: () => {
      view?.hide();
    },
  };
};

export type Tooltips = ReturnType<typeof createTooltips>;
