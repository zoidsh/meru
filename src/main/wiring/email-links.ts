import { incomingUrlsOf } from "#core/mailto.ts";
import type { AppLifecycle } from "#platform/app.ts";
import { openSessionWindow } from "#platform/content-view.ts";

import {
  answerIncomingLink,
  createComposeWindows,
  createIncomingLinks,
} from "../email-links.ts";
import type { Entitlement } from "../entitlement.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import type { SenderRegistry } from "../senders.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createTabViews } from "../tab-views.ts";
import { revealWindow } from "../windows.ts";
import { nativeQuestion } from "./test-build.ts";

/**
 * Listens for the links the system hands Meru from the start of the run,
 * before `ready`, so the one that launches it is not lost: macOS's
 * `open-url`, and the links in this launch's and a second launch's
 * arguments. They wait until `answerEmailLinks` is wired.
 */
export const receiveEmailLinks = (
  lifecycle: Pick<AppLifecycle, "onOpenUrl" | "onSecondInstance" | "launchArgv">
) => {
  const incoming = createIncomingLinks({ log: console.error });

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
 * Answers email links once the main window can show a toast, the ones held
 * first: a compose window in the profile the person picks, or, without Meru
 * Pro, a toast in the main window, shown for it.
 */
export const answerEmailLinks = ({
  incoming,
  background,
  shell,
  profiles,
  entitlement,
  overlays,
  views,
  senders,
  prepareSession,
  gmailHome,
}: {
  incoming: ReturnType<typeof receiveEmailLinks>;
  background: boolean;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Pick<Profiles, "get" | "onChange">;
  entitlement: Pick<Entitlement, "can">;
  overlays: Pick<Overlays, "open" | "hasView" | "onChange">;
  views: Pick<ReturnType<typeof createTabViews>, "windowOpening">;
  senders: Pick<SenderRegistry, "register">;
  prepareSession: (partition: string) => void;
  gmailHome: string;
}) => {
  const composeWindows = createComposeWindows({
    openWindow: openSessionWindow,
    prepareSession,
    windowOpening: views.windowOpening,
    senders,
    state: profiles.get,
    gmailHome,
    background,
    log: console.error,
  });

  profiles.onChange(composeWindows.follow);

  const answer = answerIncomingLink({
    can: entitlement.can,
    state: profiles.get,
    question: nativeQuestion(),
    compose: composeWindows.open,
    refuse: () => {
      revealWindow(shell.window, background);
      overlays.open({ kind: "toast", message: "email-links-pro" });
    },
    log: console.error,
  });

  // Once the shell's overlay document is there, so the toast that refuses a
  // link has somewhere to show.
  const start = () => {
    if (overlays.hasView()) {
      incoming.start(answer);
    }
  };

  overlays.onChange(start);
  start();
};
