import { z } from "zod/mini";

import { GMAIL_CHANNELS, GMAIL_HEALTH_SCHEMA } from "#contract/gmail.ts";
import type { GmailFeatures, GmailHealth } from "#contract/gmail.ts";
import { HOOK_NAMES } from "#core/gmail-hooks.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import type { SenderRegistry } from "./senders.ts";

export interface GmailPageDeps {
  ipc: Pick<Ipc, "on" | "send">;
  senders: Pick<SenderRegistry, "identify">;
  /** Whether the tab is Gmail's, whose view alone gets Gmail's preload. */
  isGmailTab: (key: TabKey) => boolean;
  /** Gmail's origin, or the suite's stand-in's. */
  gmailOrigin: string;
  /** The switches as the settings have them now. */
  features: () => GmailFeatures;
  /** Told of each report that differs from the tab's last. */
  onHealth?: (key: TabKey, health: GmailHealth) => void;
  /** Told of each message refused, by the sender's origin alone. */
  onRefused?: (origin: string | undefined) => void;
  log: (message: string) => void;
}

/** A frame's origin carries no path, query or fragment, so it can be logged. */
const describeSender = ({ webContentsId, isMainFrame, origin }: IpcSender) =>
  `webContents ${webContentsId} (${isMainFrame ? "main frame" : "subframe"}, ${origin ?? "no origin"})`;

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

  const refuse = (sender: IpcSender, what: string) => {
    log(`Refused Gmail's ${what} from ${describeSender(sender)}`);
    onRefused?.(sender.origin);
  };

  const send = (webContentsId: number) => {
    ipc.send(webContentsId, GMAIL_CHANNELS.features, features(), {
      mainFrameOrigin: gmailOrigin,
    });
  };

  ipc.on(GMAIL_CHANNELS.sync, (sender) => {
    const key = accepted(sender);

    if (!key) {
      // The view's next document shakes hands too, so one that left Gmail
      // stops hearing its switches here.
      if (sender.isMainFrame) {
        forget(sender.webContentsId);
      }

      refuse(sender, "handshake");

      return;
    }

    pages.set(sender.webContentsId, key);
    reports.delete(sender.webContentsId);
    send(sender.webContentsId);
  });

  ipc.on(GMAIL_CHANNELS.health, (sender, payload) => {
    const key = accepted(sender);

    if (!key || !pages.has(sender.webContentsId)) {
      refuse(sender, "health report");

      return;
    }

    const health = GMAIL_HEALTH_SCHEMA.safeParse(payload);

    if (!health.success) {
      log(
        `Refused a malformed Gmail health report: ${z.prettifyError(health.error)}`
      );

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
