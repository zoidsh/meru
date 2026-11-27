import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import { incomingUrlsOf } from "#core/mailto.ts";
import type { Platform } from "#core/platform.ts";
import type { AppLifecycle } from "#platform/app.ts";
import { openSessionWindow } from "#platform/content-view.ts";

import {
  answerIncomingLink,
  createComposeWindows,
  createIncomingLinks,
} from "../email-links.ts";
import type { Entitlement } from "../entitlement.ts";
import type { Overlays } from "../overlay.ts";
import type { ProfileQuestion } from "../profile-question.ts";
import type { Profiles } from "../profiles.ts";
import type { SenderRegistry } from "../senders.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createTabViews } from "../tab-views.ts";
import { revealWindow } from "../windows.ts";
import { registerMailHandler } from "./test-build.ts";

/**
 * Listens for the links the system hands Meru from the start of the run,
 * before `ready`, so the one that launches it is not lost: macOS's
 * `open-url`, and the links in this launch's and a second launch's
 * arguments. They wait until `answerEmailLinks` is wired.
 */
export const receiveEmailLinks = (
  lifecycle: Pick<
    AppLifecycle,
    "onOpenUrl" | "onSecondInstance" | "launchArgv"
  >,
  log: Log
) => {
  const incoming = createIncomingLinks({ log });

  lifecycle.onOpenUrl(incoming.receive);

  for (const url of incomingUrlsOf(lifecycle.launchArgv)) {
    incoming.receive(url);
  }

  lifecycle.onSecondInstance((argv) => {
    for (const url of incomingUrlsOf(argv)) {
      incoming.receive(url);
    }
  });

  return incoming;
};

/**
 * On Windows, lets Default apps offer the installed Meru for email links,
 * written again at each launch; no other build or system writes anything.
 */
export const registerAsMailApp = async (
  platform: Platform,
  userDataPath: string,
  log: Log
) => {
  try {
    await registerMailHandler(platform, userDataPath);
  } catch (error) {
    log("mail-app-register-failed", { code: scrub.code(error) });
  }
};

/**
 * The compose windows of email links and of Contact support, each closed with
 * its profile.
 */
export const wireComposeWindows = ({
  background,
  profiles,
  views,
  senders,
  prepareSession,
  gmailHome,
  preload,
  log,
}: {
  background: boolean;
  profiles: Pick<Profiles, "get" | "onChange">;
  views: Pick<ReturnType<typeof createTabViews>, "windowOpening">;
  senders: Pick<SenderRegistry, "register">;
  prepareSession: (partition: string) => void;
  gmailHome: string;
  preload: string | undefined;
  log: Log;
}) => {
  const composeWindows = createComposeWindows({
    openWindow: openSessionWindow,
    prepareSession,
    windowOpening: views.windowOpening,
    senders,
    state: profiles.get,
    gmailHome,
    ...(preload !== undefined && { preload }),
    background,
    log,
  });

  profiles.onChange(composeWindows.follow);

  return composeWindows;
};

/**
 * Answers email links once the main window's overlay can show, the ones held
 * first: a compose window in the profile the person picks in the main
 * window, shown for the question, or, without Meru Pro, a toast there.
 */
export const answerEmailLinks = ({
  incoming,
  background,
  shell,
  profiles,
  entitlement,
  overlays,
  composeWindows,
  question,
  log,
}: {
  incoming: ReturnType<typeof receiveEmailLinks>;
  background: boolean;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Pick<Profiles, "get">;
  entitlement: Pick<Entitlement, "can">;
  overlays: Pick<Overlays, "open" | "hasView" | "onChange">;
  composeWindows: Pick<ReturnType<typeof wireComposeWindows>, "open">;
  question: Pick<ProfileQuestion, "ask">;
  log: Log;
}) => {
  const answer = answerIncomingLink({
    can: entitlement.can,
    state: profiles.get,
    ask: (profileIds) => {
      revealWindow(shell.window, background);

      return question.ask(profileIds);
    },
    compose: composeWindows.open,
    refuse: () => {
      revealWindow(shell.window, background);
      overlays.open({ kind: "toast", message: "email-links-pro" });
    },
    log,
  });

  // Once the shell's overlay document is there, so the question and the
  // toast that refuses a link have somewhere to show.
  const start = () => {
    if (overlays.hasView()) {
      incoming.start(answer);
    }
  };

  overlays.onChange(start);
  start();
};
