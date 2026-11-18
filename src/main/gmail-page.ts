import { GMAIL_CHANNELS, GMAIL_HEALTH_SCHEMA } from "#contract/gmail.ts";
import type { GmailFeatures, GmailHealth } from "#contract/gmail.ts";
import { isGmailHash } from "#core/gmail-hash.ts";
import { HOOK_NAMES } from "#core/gmail-hooks.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { describeSender } from "#platform/ipc.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import type { SenderRegistry } from "./senders.ts";

export interface GmailPageDeps {
  ipc: Pick<Ipc, "on" | "send">;
  senders: Pick<SenderRegistry, "identify" | "onDropped">;
  /** Whether the tab is Gmail's, whose view alone gets Gmail's preload. */
  isGmailTab: (key: TabKey) => boolean;
  /** Gmail's origin, or the suite's stand-in's. */
  gmailOrigin: string;
  /** The switches as the settings have them now. */
  features: () => GmailFeatures;
  /** The person's own CSS for the page as it is now, empty for none. */
  userStyles: () => Promise<string>;
  /** Told of each report that differs from the tab's last. */
  onHealth?: (key: TabKey, health: GmailHealth) => void;
  /** Told of each message refused, by the sender's origin alone. */
  onRefused?: (origin: string | undefined) => void;
  log: (message: string) => void;
}

const describeHealth = (health: GmailHealth) => {
  const failing = (["broken", "absent"] as const)
    .map((status) => {
      const names = HOOK_NAMES.filter((name) => health.hooks[name] === status);

      return names.length > 0 ? `${status} ${names.join(", ")}` : "";
    })
    .filter(Boolean);

  return failing.length > 0 ? failing.join("; ") : "every hook matched";
};

/**
 * Serves Gmail's page contract: the switches, to a page that shakes hands and
 * again on every change, and its health reports, each only from the main
 * frame of a Gmail tab's view on Gmail's origin. What the page says is a hint
 * for the log, never something main acts on.
 */
export const serveGmailContract = ({
  ipc,
  senders,
  isGmailTab,
  gmailOrigin,
  features,
  userStyles,
  onHealth,
  onRefused,
  log,
}: GmailPageDeps) => {
  /** Each page that shook hands, by webContents, with its tab. */
  const pages = new Map<number, TabKey>();
  /** The last report heard from each, as it was logged. */
  const reports = new Map<number, string>();

  const gmailTabOf = (webContentsId: number): TabKey | undefined => {
    const identity = senders.identify(webContentsId);

    if (identity?.role !== "content-view") {
      return undefined;
    }

    const key = { profileId: identity.profileId, tabId: identity.tabId };

    return isGmailTab(key) ? key : undefined;
  };

  const accepted = (sender: IpcSender) =>
    sender.isMainFrame && sender.origin === gmailOrigin
      ? gmailTabOf(sender.webContentsId)
      : undefined;

  const forget = (webContentsId: number) => {
    pages.delete(webContentsId);
    reports.delete(webContentsId);
  };

  senders.onDropped(forget);

  const refuse = (sender: IpcSender, what: string) => {
    log(`Refused Gmail's ${what} from ${describeSender(sender)}`);
    onRefused?.(sender.origin);
  };

  const send = (webContentsId: number) => {
    ipc.send(webContentsId, GMAIL_CHANNELS.features, features(), {
      mainFrameOrigin: gmailOrigin,
    });
  };

  /**
   * Read afresh for each document, so a change to the file shows on the next
   * load. A later document of the same page that shook hands meanwhile gets
   * them again, in place of these.
   */
  const sendUserStyles = async (webContentsId: number) => {
    let css: string;

    try {
      css = await userStyles();
    } catch {
      log("Gmail's user styles were not read");

      return;
    }

    if (pages.has(webContentsId) && gmailTabOf(webContentsId)) {
      ipc.send(webContentsId, GMAIL_CHANNELS.userStyles, css, {
        mainFrameOrigin: gmailOrigin,
      });
    }
  };

  ipc.on(GMAIL_CHANNELS.sync, (sender) => {
    const key = accepted(sender);

    if (!key) {
      // The view's next document shakes hands too, so one that left Gmail
      // stops hearing its switches here.
      if (!sender.isMainFrame) {
        refuse(sender, "handshake");

        return;
      }

      forget(sender.webContentsId);

      // A Gmail tab passes through sign-in, single sign-on and error pages on
      // other origins, which is no attack and no news.
      if (!gmailTabOf(sender.webContentsId)) {
        refuse(sender, "handshake");
      }

      return;
    }

    pages.set(sender.webContentsId, key);
    reports.delete(sender.webContentsId);
    send(sender.webContentsId);
    void sendUserStyles(sender.webContentsId);
  });

  ipc.on(GMAIL_CHANNELS.health, (sender, payload) => {
    const key = accepted(sender);

    if (!key || !pages.has(sender.webContentsId)) {
      refuse(sender, "health report");

      return;
    }

    const health = GMAIL_HEALTH_SCHEMA.safeParse(payload);

    if (!health.success) {
      // What the page sent may quote the page, so none of it is logged.
      log("Refused a malformed Gmail health report");

      return;
    }

    const views = health.data.views.join(", ") || "no view";
    const line = `Gmail's page in tab ${tabKey(key)} (${views}): ${describeHealth(health.data)}`;

    if (reports.get(sender.webContentsId) === line) {
      return;
    }

    reports.set(sender.webContentsId, line);
    log(`${line}, checked in ${health.data.ms} ms`);
    onHealth?.(key, health.data);
  });

  return {
    /**
     * Tells each page of the profile that shook hands, while its main frame
     * is still on Gmail's origin, to catch up.
     */
    catchUp: (profileId: string) => {
      for (const [webContentsId, key] of pages) {
        if (key.profileId !== profileId) {
          continue;
        }

        if (gmailTabOf(webContentsId)) {
          ipc.send(webContentsId, GMAIL_CHANNELS.catchUp, undefined, {
            mainFrameOrigin: gmailOrigin,
          });
        } else {
          forget(webContentsId);
        }
      }
    },
    /**
     * Sends the profile's Gmail page to `hash`, while its main frame is
     * still on Gmail's origin; false when no page of the profile took it,
     * having not shaken hands or left Gmail since (for sign-in, say), so the
     * caller loads Gmail instead.
     */
    navigate: (profileId: string, hash: string) => {
      let sent = false;

      if (!isGmailHash(hash)) {
        return sent;
      }

      for (const [webContentsId, key] of pages) {
        if (key.profileId !== profileId) {
          continue;
        }

        if (gmailTabOf(webContentsId)) {
          sent =
            ipc.send(webContentsId, GMAIL_CHANNELS.navigate, hash, {
              mainFrameOrigin: gmailOrigin,
            }) || sent;
        } else {
          forget(webContentsId);
        }
      }

      return sent;
    },
    /** Sends the switches as they are now to every page that shook hands. */
    push: () => {
      for (const webContentsId of pages.keys()) {
        if (gmailTabOf(webContentsId)) {
          send(webContentsId);
        } else {
          forget(webContentsId);
        }
      }
    },
  };
};
