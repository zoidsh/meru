import {
  BrowserWindow,
  desktopCapturer,
  shell,
  systemPreferences,
} from "electron";

import type { Platform } from "#core/platform.ts";
import { THUMBNAIL_SIZE } from "#core/screen-picker.ts";
import type { ScreenCaptureStatus, ScreenSource } from "#core/screen-picker.ts";

/** What can be shared, and what the system says of sharing it. */
export interface ScreenSources {
  status: () => ScreenCaptureStatus;
  /** Every screen and window but Meru's own. */
  list: () => Promise<ScreenSource[]>;
  /** Whether a source listed before is still there to share. */
  has: (id: string) => Promise<boolean>;
  /** The system's Screen Recording settings, on macOS. */
  openSettings: () => Promise<void>;
}

/** What a session's display-media handler hands Chromium, and what it was set to. */
export interface DisplayMediaStreams {
  /** The video for a source chosen in Meru's picker, asked for by `frame`. */
  video: (
    source: Pick<ScreenSource, "id" | "name">,
    frame: Electron.WebFrameMain | null
  ) => Electron.Video | Electron.WebFrameMain;
  /**
   * The `useSystemPicker` a session's handler is set with, given the one
   * the setting asks for; asked each time the handler is set.
   */
  systemPicker: (partition: string, asked: boolean) => boolean;
}

const MACOS_SCREEN_RECORDING_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

/** `window:<handle>:<n>`, whose last part differs by the process asking. */
const windowHandle = (id: string) => id.split(":").slice(0, 2).join(":");

/**
 * Meru's own windows are left out by their handle, never their title, which
 * a page sets.
 */
const ownWindowHandles = () =>
  new Set(
    BrowserWindow.getAllWindows().map((window) =>
      windowHandle(window.getMediaSourceId())
    )
  );

const listSources = async (thumbnails: boolean) => {
  const own = ownWindowHandles();
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: thumbnails ? THUMBNAIL_SIZE : { width: 0, height: 0 },
  });

  return sources.filter(({ id }) => !own.has(windowHandle(id)));
};

/** The system's. Never used by the suite's build or a test. */
export const createScreenSources = (
  platform: Platform
): { sources: ScreenSources; streams: DisplayMediaStreams } => ({
  sources: {
    // Linux has no such setting; Windows answers granted.
    status: () =>
      platform === "linux"
        ? "granted"
        : systemPreferences.getMediaAccessStatus("screen"),
    list: async () => {
      const sources = await listSources(true);

      return sources.map(({ id, name, thumbnail }) => ({
        id,
        name,
        thumbnail: thumbnail.toDataURL(),
      }));
    },
    has: async (id) => {
      const sources = await listSources(false);

      return sources.some((source) => source.id === id);
    },
    openSettings: async () => {
      if (platform === "darwin") {
        await shell.openExternal(MACOS_SCREEN_RECORDING_URL);
      }
    },
  },
  streams: {
    video: ({ id, name }) => ({ id, name }),
    systemPicker: (_partition, asked) => asked,
  },
});

/** What the end-to-end build's stand-in lists and was asked, which a test sets and reads. */
export interface CapturedScreenSources {
  status: ScreenCaptureStatus;
  windows: { id: string; name: string }[];
  screens: { id: string; name: string }[];
  /** Listing rejects while set. */
  fails: boolean;
  /** Ids `has` answers are gone. */
  gone: string[];
  listed: number;
  settingsOpened: number;
  /** The `useSystemPicker` each session's handler was last set with, by partition. */
  systemPicker: Record<string, boolean>;
  /** Each source a page was handed, in order. */
  shared: { id: string; name: string }[];
}

const thumbnail = (name: string, hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_SIZE.width}" height="${THUMBNAIL_SIZE.height}"><rect width="100%" height="100%" fill="hsl(${hue} 45% 55%)"/><rect x="16" y="16" width="288" height="24" rx="4" fill="hsl(${hue} 45% 75%)"/><text x="24" y="33" font-family="sans-serif" font-size="14" fill="hsl(${hue} 45% 20%)">${name}</text></svg>`
  )}`;

/**
 * The end-to-end build's, which never asks the system for its screens or
 * shows its prompt or settings: fixed sources with drawn thumbnails, and a
 * chosen one handed over as the asking frame's own page, which Chromium
 * captures with no system permission.
 */
export const createCapturedScreenSources = (): {
  sources: ScreenSources;
  streams: DisplayMediaStreams;
} => {
  const captured: CapturedScreenSources = {
    status: "granted",
    windows: [
      { id: "window:101:0", name: "Notes" },
      { id: "window:102:0", name: "Slides for Monday" },
      { id: "window:103:0", name: "Terminal" },
    ],
    screens: [
      { id: "screen:1:0", name: "Entire Screen" },
      { id: "screen:2:0", name: "Screen 2" },
    ],
    fails: false,
    gone: [],
    listed: 0,
    settingsOpened: 0,
    systemPicker: {},
    shared: [],
  };

  Reflect.set(globalThis, "meruTestScreenSources", captured);

  const all = () => [...captured.windows, ...captured.screens];

  return {
    sources: {
      status: () => captured.status,
      list: () => {
        captured.listed += 1;

        if (captured.fails) {
          return Promise.reject(new Error("The stand-in fails to list"));
        }

        return Promise.resolve(
          all().map((source, index) => ({
            ...source,
            thumbnail: thumbnail(source.name, (index * 67) % 360),
          }))
        );
      },
      has: (id) =>
        Promise.resolve(
          !captured.gone.includes(id) &&
            all().some((source) => source.id === id)
        ),
      openSettings: () => {
        captured.settingsOpened += 1;

        return Promise.resolve();
      },
    },
    streams: {
      video: (source, frame) => {
        captured.shared.push({ id: source.id, name: source.name });

        return frame ?? source;
      },
      // Recorded, never given: macOS's own picker would show on the desktop
      // and leave the stand-in unasked.
      systemPicker: (partition, asked) => {
        captured.systemPicker[partition] = asked;

        return false;
      },
    },
  };
};
