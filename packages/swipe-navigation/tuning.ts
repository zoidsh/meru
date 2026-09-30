import { ms } from "@meru/shared/ms";

/**
 * Every number the feel of a swipe depends on, in one place, so that changing
 * one is a change to this file rather than a hunt through Objective-C++.
 * `start()` hands the whole object to the addon.
 */
export const SWIPE_NAVIGATION_TUNING = {
  /**
   * The gesture progress, from `0` to `1`, at which the bubble finishes sliding
   * in and takes on its committed look. Only what the bubble shows: whether the
   * swipe navigates is AppKit's decision, reported through `completionAmount`.
   */
  commitThreshold: 0.3,

  /**
   * The progress at or above which a finished gesture counts as a navigation.
   * AppKit animates the amount to exactly `1` for a swipe it completed and back
   * to `0` for one it did not, so anything short of the whole way is a cancel.
   */
  completionAmount: 0.99,

  /**
   * How far the accumulated horizontal scroll of a gesture has to beat its
   * vertical scroll before the gesture counts as horizontal. `1` is what
   * Chromium compares, and raising it makes a diagonal flick scroll rather than
   * navigate.
   */
  horizontalDominanceRatio: 1,

  /** Points of horizontal scroll below which a gesture is only jitter. */
  minimumHorizontalDelta: 3,

  /**
   * Points of vertical scroll after which a gesture can no longer become a
   * swipe, however far it then travels sideways. Without it, a page scrolled
   * down and then flicked sideways navigates.
   */
  maximumVerticalDelta: 20,

  /** The bubble's diameter, in points. */
  overlayDiameter: 44,

  /**
   * How far the bubble's center sits from the view's edge once it has finished
   * arriving, which is where `commitThreshold` puts it.
   */
  overlayMaxOffset: 56,

  /** How much further the bubble drifts over the rest of a committed gesture. */
  overlayCommittedDrift: 14,

  /** The progress over which the bubble fades in from nothing. */
  overlayFadeInProgress: 0.15,

  /** How long the bubble takes to fade away once the swipe has navigated. */
  overlayFadeOutDuration: ms("150ms"),
} as const;
