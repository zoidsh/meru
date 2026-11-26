import type { App } from "./apps.ts";
import { allowsPermission } from "./permissions.ts";
import type { Platform } from "./platform.ts";

/** A screen or a window that can be shared, as the picker lists it. */
export interface ScreenSource {
  /** Chromium's, `screen:…` or `window:…`. */
  id: string;
  name: string;
  /** A data URL of about 320 by 180. */
  thumbnail: string;
}

/** What the system says of Meru recording the screen, by Electron's names. */
export type ScreenCaptureStatus =
  | "granted"
  | "denied"
  | "restricted"
  | "not-determined"
  | "unknown";

/** The size thumbnails are asked for at, a 16:9 card's. */
export const THUMBNAIL_SIZE = { width: 320, height: 180 } as const;

export const sourceKind = (id: string): "screen" | "window" =>
  id.startsWith("screen:") ? "screen" : "window";

/** The picker's card, as main has it. */
export type PickerCard =
  | { kind: "loading" }
  | { kind: "listed"; windows: ScreenSource[]; screens: ScreenSource[] }
  | { kind: "failed" }
  /** macOS refuses Meru the screen; the list is not asked for. */
  | { kind: "denied" }
  /** The source chosen had gone; the request was answered with no stream. */
  | { kind: "gone" };

/** The card for what was listed, windows and screens apart, each in the list's order. */
export const listedCard = (sources: readonly ScreenSource[]): PickerCard => ({
  kind: "listed",
  windows: sources.filter(({ id }) => sourceKind(id) === "window"),
  screens: sources.filter(({ id }) => sourceKind(id) === "screen"),
});

/** Whether sessions ask macOS for its picker: only there, and only while the setting reads on. */
export const usesSystemPicker = (platform: Platform, setting: boolean) =>
  platform === "darwin" && setting;

/**
 * Whether the status keeps the picker from listing: only macOS refuses,
 * and only once the person said no or a policy does. A status not yet
 * asked lists, which is what has macOS ask.
 */
export const blocksListing = (
  platform: Platform,
  status: ScreenCaptureStatus
) => platform === "darwin" && (status === "denied" || status === "restricted");

/**
 * Whether a frame may be offered a screen at all: only a frame whose own
 * origin is that of an app given `display-capture`, Meet's.
 */
export const mayShareScreen = (
  apps: readonly App[],
  frameOrigin: string | undefined
) =>
  frameOrigin !== undefined &&
  allowsPermission(apps, {
    permission: "display-capture",
    requestingUrl: frameOrigin,
  });
