import type { Capability } from "#core/entitlement.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import { composeUrl, isMailtoUrl } from "#core/mailto.ts";
import {
  enabledProfiles,
  GMAIL_TAB_ID,
  knownTabs,
  profilePartition,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type {
  SessionWindow,
  SessionWindowOptions,
  WindowOpenAnswer,
} from "#platform/content-view.ts";

import type { SenderRegistry } from "./senders.ts";

/** Asks which of `profileIds`, in that order, writes; the one picked, if any. */
export type AskProfile = (
  profileIds: readonly string[]
) => Promise<string | undefined>;

/**
 * Which profile writes an email: the one enabled profile, or the one the
 * person picks of them, in the titlebar's order; none when they cancel or
 * none is enabled.
 */
export const chooseProfile = (
  state: State,
  ask: AskProfile
): Promise<string | undefined> => {
  const profiles = enabledProfiles(state);

  if (profiles.length <= 1) {
    return Promise.resolve(profiles[0]?.id);
  }

  return ask(profiles.map((profile) => profile.id));
};

export const MAX_WAITING_LINKS = 10;

/**
 * The links the system hands Meru, from a click anywhere on the computer,
 * received from the start of the run. Those that come before main can act
 * are held, in order, until `start` gives it what answers them; then each is
 * answered in turn, so only one question shows at a time. At most
 * `MAX_WAITING_LINKS` wait, so another app sending links in a loop cannot
 * stack questions or windows without end.
 */
export const createIncomingLinks = ({ log }: { log: Log }) => {
  const held: string[] = [];
  let answer: ((url: string) => Promise<void>) | undefined;
  let turn = Promise.resolve();
  let waiting = 0;

  const take = (url: string, answerWith: (url: string) => Promise<void>) => {
    const before = turn;

    turn = (async () => {
      await before;

      try {
        await answerWith(url);
      } catch (error) {
        log("email-link-open-failed", { code: scrub.code(error) });
      } finally {
        waiting -= 1;
      }
    })();
  };

  return {
    receive: (url: string) => {
      if (waiting >= MAX_WAITING_LINKS) {
        log("email-link-dropped", { waiting });

        return;
      }

      waiting += 1;

      if (answer) {
        take(url, answer);
      } else {
        held.push(url);
      }
    },
    /** Answers the links held so far, in order, and each later one as it comes. */
    start: (answerWith: (url: string) => Promise<void>) => {
      if (answer) {
        return;
      }

      answer = answerWith;

      for (const url of held.splice(0)) {
        take(url, answerWith);
      }
    },
  };
};

/**
 * What answers an incoming link. Only a `mailto:` link is acted on: without
 * the capability it is refused, which the person is told of, and otherwise
 * it opens a compose window in the profile they pick. No part of a link is
 * logged or kept.
 */
export const answerIncomingLink =
  ({
    can,
    state,
    ask,
    compose,
    refuse,
    log,
  }: {
    can: (capability: Capability) => boolean;
    state: () => State;
    ask: AskProfile;
    compose: (profileId: string, mailto: string) => void;
    /** Tells the person the link needs Meru Pro. */
    refuse: () => void;
    log: Log;
  }) =>
  async (url: string) => {
    if (!isMailtoUrl(url)) {
      log("email-link-ignored", { url: scrub.host(url) });

      return;
    }

    if (!can("incomingLinks")) {
      refuse();

      return;
    }

    const profileId = await chooseProfile(state(), ask);

    if (profileId !== undefined) {
      compose(profileId, url);
    }
  };

/**
 * The compose windows email links open, each in its profile's session and
 * answered as a window of the profile's Gmail tab, whether that tab has a
 * page or sleeps. One closes by itself, as Gmail closes it after a discard,
 * or with its profile, removed or turned off; sleep leaves it. Nothing of
 * one is stored, so none comes back at the next launch.
 */
export const createComposeWindows = ({
  openWindow,
  prepareSession,
  windowOpening,
  senders,
  state,
  gmailHome,
  preload,
  background,
  log,
}: {
  openWindow: (options: SessionWindowOptions) => SessionWindow;
  /** Readies the profile's session as before any page of it loads. */
  prepareSession: (partition: string) => void;
  windowOpening: {
    onWindowOpen: (
      key: TabKey,
      url: string,
      asked?: { inBackground: boolean }
    ) => WindowOpenAnswer;
    onChildNavigation: (key: TabKey, url: string) => "allow" | "deny";
  };
  senders: Pick<SenderRegistry, "register">;
  state: () => State;
  gmailHome: string;
  /** Gmail's preload, which the compose window's own page gets. */
  preload?: string;
  background: boolean;
  log: Log;
}) => {
  const open = new Map<SessionWindow, string>();

  const gmailTabOf = (profileId: string): TabKey | undefined => {
    const profile = enabledProfiles(state()).find(
      (candidate) => candidate.id === profileId
    );

    if (!profile) {
      return;
    }

    const tab = knownTabs(profile).find(
      (candidate) => candidate.app === "gmail"
    );

    return { profileId, tabId: tab?.id ?? GMAIL_TAB_ID };
  };

  return {
    open: (profileId: string, mailto: string) => {
      const key = gmailTabOf(profileId);

      if (!key) {
        log("compose-window-refused", { reason: "no-profile" });

        return;
      }

      const partition = profilePartition(profileId);

      prepareSession(partition);

      const window = openWindow({
        partition,
        ...(preload !== undefined && { preload }),
        url: composeUrl(gmailHome, mailto),
        background,
        onWindowOpen: (url, asked) =>
          windowOpening.onWindowOpen(key, url, asked),
        onChildNavigation: (url) => windowOpening.onChildNavigation(key, url),
        onWebContents: (webContentsId, _kind, openedAt) =>
          senders.register(webContentsId, {
            role: "child-window",
            ...key,
            ...(openedAt !== undefined && { openedAt }),
          }),
        // Never called before `openWindow` returns.
        onClosed: () => {
          // oxlint-disable-next-line no-use-before-define -- closed only once open
          open.delete(window);
        },
      });
      open.set(window, profileId);
    },
    /** Closes the windows of each profile removed or turned off. */
    follow: (current: State) => {
      const kept = new Set(
        enabledProfiles(current).map((profile) => profile.id)
      );

      for (const [window, profileId] of open) {
        if (!kept.has(profileId)) {
          open.delete(window);
          window.close();
        }
      }
    },
  };
};
