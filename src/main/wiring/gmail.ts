import path from "node:path";

import type { App } from "#core/apps.ts";
import { GMAIL_FEATURES, gmailFeatures } from "#core/gmail-hooks.ts";
import { gmailOwnWindow, profilePartition } from "#core/state.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import { createIpc } from "#platform/ipc.ts";
import type { createPower } from "#platform/power.ts";
import type { createSessions } from "#platform/sessions.ts";
import { readTextUpTo } from "#platform/text-file.ts";

import { createCatchUp } from "../catch-up.ts";
import type { Entitlement } from "../entitlement.ts";
import type { Focus } from "../focus.ts";
import { createGmailNavigation } from "../gmail-navigation.ts";
import { serveGmailContract } from "../gmail-page.ts";
import { createInbox } from "../inbox.ts";
import { createMailActions } from "../mail-actions.ts";
import type { MailPoller } from "../mail.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import type { SenderRegistry } from "../senders.ts";
import type { SettingsStore } from "../settings.ts";
import { createShowGmail } from "../show-gmail.ts";
import type { createTabViews } from "../tab-views.ts";
import {
  USER_STYLES_FILE_NAME,
  USER_STYLES_MAX_BYTES,
  createUserStyles,
} from "../user-styles.ts";
import { exposeSettingsToSuite, gmailPageCapture } from "./test-build.ts";

/**
 * Gmail's page contract, its switches following the settings, which the
 * suite's build alone may also switch from outside. Answers with what tells
 * a profile's page to catch up, at most every 2 s.
 */
const serveGmailPage = ({
  gmailOrigin,
  senders,
  profiles,
  settings,
  userStyles,
}: {
  gmailOrigin: string | undefined;
  senders: SenderRegistry;
  profiles: Pick<Profiles, "get">;
  settings: SettingsStore;
  userStyles: () => Promise<string>;
}) => {
  exposeSettingsToSuite(settings);

  if (gmailOrigin === undefined) {
    return { catchUp: createCatchUp(() => false), navigate: () => false };
  }

  const gmailPage = serveGmailContract({
    ipc: createIpc(),
    senders,
    isGmailTab: (key) => findTab(profiles.get(), key)?.app === "gmail",
    gmailOrigin,
    features: () => gmailFeatures(settings.get),
    userStyles,
    ...gmailPageCapture(),
    log: console.error,
  });

  for (const feature of GMAIL_FEATURES) {
    settings.onChange(feature, gmailPage.push);
  }

  return {
    catchUp: createCatchUp(gmailPage.catchUp),
    navigate: gmailPage.navigate,
  };
};

/**
 * What shows and drives Gmail from outside its page: opening a message or a
 * view in the profile's Gmail tab, Gmail's page contract and its catch-up,
 * the actions a notification or the unified inbox takes on a message, and
 * the unified inbox.
 */
export const wireGmail = ({
  lifecycle,
  sessions,
  power,
  senders,
  settings,
  profiles,
  views,
  overlays,
  focus,
  mail,
  gmail,
  gmailHome,
  gmailOrigin,
  showOwnWindow,
  revealGmail,
  entitlement,
}: {
  entitlement: Pick<Entitlement, "can">;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  sessions: ReturnType<typeof createSessions>;
  power: ReturnType<typeof createPower>;
  senders: SenderRegistry;
  settings: SettingsStore;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  overlays: Overlays;
  focus: Focus;
  mail: MailPoller;
  gmail: App | undefined;
  gmailHome: string;
  gmailOrigin: string | undefined;
  showOwnWindow: (key: TabKey) => void;
  revealGmail: (profileId: string) => void;
}) => {
  const showGmail = createShowGmail({
    state: profiles.get,
    openInGmailTab: async (profileId, url) => {
      if (gmail) {
        await views.open(profileId, gmail, url);
      }
    },
    selectTab: views.select,
    selectProfile: profiles.select,
    closeInbox: () => {
      // oxlint-disable-next-line no-use-before-define -- the inbox opens messages through this
      inbox.setOpen(false);
    },
    home: gmailHome,
    log: console.error,
  });
  const gmailPage = serveGmailPage({
    gmailOrigin,
    senders,
    profiles,
    settings,
    userStyles: createUserStyles({
      read: () =>
        readTextUpTo(
          path.join(lifecycle.userDataPath, USER_STYLES_FILE_NAME),
          USER_STYLES_MAX_BYTES
        ),
      log: console.error,
    }),
  });
  const { catchUp } = gmailPage;
  const navigateGmail = createGmailNavigation({
    send: gmailPage.navigate,
    jumpTo: showGmail.jumpTo,
    openMessage: showGmail.openMessage,
    // The person asked for it from the menu or a shortcut, so, as a
    // notification's click, it may take the foreground; never under the
    // background flag.
    reveal: revealGmail,
    home: gmailHome,
  });

  // A removed profile's pending catch-up is dropped with it.
  profiles.onChange(catchUp.follow);
  // Gmail's own push channel can stay down for minutes after a wake.
  power.onResume(() => {
    catchUp.requestAll(profiles.get());
  });

  const mailActions =
    gmailOrigin === undefined
      ? undefined
      : createMailActions({
          post: (profileId, request, signal) =>
            sessions.post(
              profilePartition(profileId),
              `${gmailOrigin}${request.path}`,
              request.body,
              signal
            ),
          poke: mail.poke,
          catchUp: catchUp.request,
          log: console.error,
        });
  const inbox = createInbox({
    mail,
    run: (profileId, action, messageId) =>
      mailActions
        ? mailActions.run(profileId, action, messageId)
        : Promise.resolve({ kind: "failed", reason: "no Gmail" }),
    open: async (profileId, url) => {
      await showGmail.openMessage(profileId, url);

      const own = gmailOwnWindow(profiles.get(), profileId);

      // Not back to the inbox's button: the message is what was asked for.
      if (own) {
        showOwnWindow(own);
      } else {
        focus.focus([{ kind: "front" }]);
      }
    },
    inbox: gmailHome,
    includes: (profileId) => settings.get("unifiedInbox", profileId),
    initial: profiles.get(),
    overlay: {
      isOpen: () => overlays.current()?.kind === "inbox",
      open: () => {
        overlays.open({ kind: "inbox" });
      },
      close: () => {
        overlays.close();
      },
    },
    allowed: () => entitlement.can("unifiedInbox"),
    log: console.error,
  });

  mail.onPoll(inbox.polled);
  settings.onChange("unifiedInbox", inbox.refresh);

  return { showGmail, navigateGmail, mailActions, inbox };
};
