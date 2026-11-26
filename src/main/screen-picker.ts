import type { App } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import {
  blocksListing,
  listedCard,
  mayShareScreen,
} from "#core/screen-picker.ts";
import type { PickerCard, ScreenSource } from "#core/screen-picker.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { ScreenSources } from "#platform/screen-sources.ts";
import type { DisplayMediaHandler } from "#platform/sessions.ts";

import type { Overlays } from "./overlay.ts";
import type { SenderIdentity } from "./senders.ts";

export interface ScreenPickerDeps {
  apps: readonly App[];
  platform: Platform;
  sources: ScreenSources;
  identify: (webContentsId: number) => SenderIdentity | undefined;
  /** Whether the tab's page is in a window of its own, where its picker shows. */
  inOwnWindow: (key: TabKey) => boolean;
  /** Whether that window is open to show it in. */
  ownWindowOpen: (key: TabKey) => boolean;
  /** Whether the tab still has its page: not closed, asleep or gone with its profile. */
  hasPage: (key: TabKey) => boolean;
  overlays: Pick<
    Overlays,
    "open" | "close" | "current" | "hasView" | "onChange"
  >;
  log: (message: string) => void;
}

type Answer = Parameters<DisplayMediaHandler>[1];

interface Request {
  /** The tab whose page asked, or whose page opened the window that asked. */
  key: TabKey;
  /** The tab's own window it shows in; none for the main window. */
  window: TabKey | undefined;
  webContentsId: number;
  /** Until it is answered, once. */
  answer: Answer | undefined;
  card: PickerCard;
  sources: ScreenSource[];
}

const MAIN = "main";

const isPickerFor = (overlay: Overlay | undefined, key: TabKey) =>
  overlay?.kind === "screen-picker" &&
  overlay.profileId === key.profileId &&
  overlay.tabId === key.tabId;

const surfaceOf = (window: TabKey | undefined) =>
  window === undefined ? MAIN : `window:${tabKey(window)}`;

/**
 * Meru's picker for a page asking to share a screen: only Meet's own
 * frames, in a page Meru made, are offered one. It shows over the page that
 * asked, in the main window's overlay or in the card slot of the tab's own
 * window, one per window, and answers the request once: with the source
 * shared, or with no stream as it is dismissed, its tab goes or sleeps, or
 * its page navigates away.
 */
export const createScreenPicker = ({
  apps,
  platform,
  sources,
  identify,
  inOwnWindow,
  ownWindowOpen,
  hasPage,
  overlays,
  log,
}: ScreenPickerDeps) => {
  const requests = new Map<string, Request>();
  const listeners = new Set<() => void>();
  const closedInListeners = new Set<(window: TabKey) => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  /**
   * Answers the request, if it is not yet, and takes its card away;
   * `fromWithin` when that was asked in its own window's card.
   */
  const finish = (
    request: Request,
    source?: Pick<ScreenSource, "id" | "name">,
    {
      fromWithin = false,
      keepCard,
    }: { fromWithin?: boolean; keepCard?: PickerCard } = {}
  ) => {
    const { answer } = request;

    request.answer = undefined;
    answer?.(source);

    if (keepCard) {
      request.card = keepCard;
      notify();

      return;
    }

    if (requests.get(surfaceOf(request.window)) !== request) {
      return;
    }

    requests.delete(surfaceOf(request.window));

    if (request.window === undefined) {
      if (isPickerFor(overlays.current(), request.key)) {
        overlays.close();
      }
    } else if (fromWithin) {
      for (const listener of closedInListeners) {
        listener(request.window);
      }
    }

    notify();
  };

  const load = async (request: Request) => {
    if (blocksListing(platform, sources.status())) {
      request.card = { kind: "denied" };
      notify();

      return;
    }

    request.card = { kind: "loading" };
    notify();

    let listed: ScreenSource[] | undefined;

    try {
      listed = await sources.list();
    } catch (error) {
      log(
        `The screens and windows to share were not listed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Dismissed, or loading again, while it listed.
    if (
      requests.get(surfaceOf(request.window)) !== request ||
      !request.answer
    ) {
      return;
    }

    request.sources = listed ?? [];
    request.card = listed ? listedCard(listed) : { kind: "failed" };
    notify();
  };

  const request: DisplayMediaHandler = (
    { webContentsId, frameOrigin },
    answer
  ) => {
    const identity =
      webContentsId === undefined ? undefined : identify(webContentsId);

    if (
      webContentsId === undefined ||
      (identity?.role !== "content-view" &&
        identity?.role !== "child-window") ||
      !mayShareScreen(apps, frameOrigin)
    ) {
      answer();

      return;
    }

    const key = { profileId: identity.profileId, tabId: identity.tabId };
    const window = inOwnWindow(key) ? key : undefined;
    const surface = surfaceOf(window);
    const shown = requests.get(surface);

    // A card left saying its source had gone answers nothing any more.
    if (shown && !shown.answer) {
      requests.delete(surface);
    }

    // One picker a window; the license notice is read once and not replaced.
    if (
      requests.has(surface) ||
      (window === undefined
        ? !overlays.hasView() || overlays.current()?.kind === "license"
        : !ownWindowOpen(window))
    ) {
      answer();

      return;
    }

    const opened: Request = {
      key,
      window,
      webContentsId,
      answer,
      card: { kind: "loading" },
      sources: [],
    };

    requests.set(surface, opened);

    if (window === undefined) {
      overlays.open({ kind: "screen-picker", ...key });
    }

    void load(opened);
  };

  const at = (window: TabKey | undefined) => requests.get(surfaceOf(window));

  // Escape, a press outside, a tab selected, or another overlay in its place.
  overlays.onChange(() => {
    const main = requests.get(MAIN);

    if (main && !isPickerFor(overlays.current(), main.key)) {
      finish(main);
    }
  });

  return {
    request,
    /** Shares the source chosen, if it is still there to share. */
    share: async (sourceId: string, window?: TabKey) => {
      const open = at(window);
      const source = open?.sources.find(({ id }) => id === sourceId);

      if (!open?.answer || !source) {
        return;
      }

      let there = false;

      try {
        there = await sources.has(sourceId);
      } catch (error) {
        log(
          `Whether a source is still there was not read: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (at(window) !== open || !open.answer) {
        return;
      }

      if (there) {
        finish(
          open,
          { id: source.id, name: source.name },
          { fromWithin: true }
        );
      } else if (window === undefined) {
        finish(open);
        overlays.open({ kind: "toast", message: "screen-source-gone" });
      } else {
        finish(open, undefined, { keepCard: { kind: "gone" } });
      }
    },
    /** Cancel, Escape or a press outside, answering with no stream. */
    cancel: (window?: TabKey) => {
      const open = at(window);

      if (open) {
        finish(open, undefined, { fromWithin: true });
      }
    },
    /** Try again, after the list could not be had. */
    retry: (window?: TabKey) => {
      const open = at(window);

      if (open?.answer && open.card.kind === "failed") {
        void load(open);
      }
    },
    openSettings: async () => {
      try {
        await sources.openSettings();
      } catch (error) {
        log(
          `The Screen Recording settings did not open: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    /** The card over the main window's page, while one is there. */
    mainCard: () => requests.get(MAIN)?.card,
    /** The card in the tab's own window, while one is there. */
    windowCard: (window: TabKey) => at(window)?.card,
    /** Cancels any request whose tab has lost its page. */
    follow: () => {
      for (const open of requests.values()) {
        if (!hasPage(open.key)) {
          finish(open);
        }
      }
    },
    /** Told as a tab's page navigates to another document. */
    navigated: (key: TabKey) => {
      for (const open of requests.values()) {
        if (
          tabKey(open.key) === tabKey(key) &&
          identify(open.webContentsId)?.role === "content-view"
        ) {
          finish(open);
        }
      }
    },
    /** Told as a web contents goes, which a request it made goes with. */
    dropped: (webContentsId: number) => {
      for (const open of requests.values()) {
        if (open.webContentsId === webContentsId) {
          finish(open);
        }
      }
    },
    /** Takes the card from a tab's own window as the window closes or another card opens there. */
    closeIn: (window: TabKey) => {
      const open = at(window);

      if (open) {
        finish(open);
      }
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    /** Told of the tab whose own window the card was closed in from within. */
    onClosedIn: (listener: (window: TabKey) => void) => {
      closedInListeners.add(listener);
    },
  };
};

export type ScreenPicker = ReturnType<typeof createScreenPicker>;
