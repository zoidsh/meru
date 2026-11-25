import type { Platform } from "./platform.ts";
import { sidebarWidth } from "./sidebar.ts";
import type { SidebarState } from "./sidebar.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** Main places the content view below it and the shell draws it this tall. */
export const TITLEBAR_HEIGHT = 40;

/** The trial footer, along the shell below the page, as tall as the titlebar. */
export const TRIAL_FOOTER_HEIGHT = TITLEBAR_HEIGHT;

/** What of the shell's chrome is drawn around the page. */
export interface ShellFrame {
  sidebar: SidebarState;
  /** The trial footer shows below the page. */
  trialFooter: boolean;
}

export interface ViewFrame {
  /** Kept free around the view, below the titlebar and beside the sidebar. */
  inset: { top: number; right: number; bottom: number; left: number };
  radius: number;
}

/**
 * How the view sits in its area: inset from the window's right and bottom
 * edges, and from its left while the sidebar is hidden, flush with the
 * titlebar, the sidebar and the trial footer, with rounded corners. Main
 * places the view by it and the shell draws its chrome by it.
 */
export const viewFrame = ({ sidebar, trialFooter }: ShellFrame): ViewFrame => ({
  inset: {
    top: 0,
    right: 8,
    bottom: trialFooter ? 0 : 8,
    left: sidebar === "hidden" ? 8 : 0,
  },
  radius: 8,
});

/** Where the content view sits in a window's content area. */
export const contentViewBounds = (
  contentSize: Size,
  frame: ShellFrame,
  platform: Platform
): Rectangle => {
  const { inset } = viewFrame(frame);
  const x = sidebarWidth(frame.sidebar, platform) + inset.left;
  const y = TITLEBAR_HEIGHT + inset.top;
  const footer = frame.trialFooter ? TRIAL_FOOTER_HEIGHT : 0;

  return {
    x,
    y,
    width: Math.max(0, contentSize.width - x - inset.right),
    height: Math.max(0, contentSize.height - y - inset.bottom - footer),
  };
};
