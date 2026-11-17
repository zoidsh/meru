import { tooltipViewBounds } from "#core/tooltip.ts";
import type { TooltipSide } from "#core/tooltip.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";
import type { OverlayView } from "#platform/overlay-view.ts";

/**
 * The view the shell's tooltips are drawn in, above the page and any
 * overlay, sized to the one that shows. It is never focused, so a tooltip
 * takes no key from what has them; a click that lands in it hides it and
 * `refocus` gives focus back.
 */
export const createTooltips = ({
  area,
  refocus,
}: {
  area: () => Size;
  refocus: () => void;
}) => {
  let view: OverlayView | undefined;

  const hide = () => {
    view?.hide();
  };

  return {
    /** Takes the view the shell's tooltip document shows in. */
    adopt: (next: OverlayView) => {
      view = next;
      next.onFocus(() => {
        hide();
        refocus();
      });
      next.onGone(() => {
        if (view === next) {
          view = undefined;
        }
      });
    },
    /**
     * Shows the view around a tooltip at `rectangle` on `side` of its
     * trigger, kept inside the window.
     */
    show: (rectangle: Rectangle, side: TooltipSide) => {
      view?.setBounds(tooltipViewBounds(rectangle, side, area()));
      view?.show();
    },
    hide,
  };
};

export type Tooltips = ReturnType<typeof createTooltips>;
