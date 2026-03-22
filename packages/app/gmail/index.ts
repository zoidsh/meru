import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import {
  createGmailDelegatedAccountUrl,
  GMAIL_INBOX_FEED_URL,
  GMAIL_PRELOAD_ARGUMENTS,
  GMAIL_URL,
  type GmailMail,
} from "@meru/shared/gmail";
import { getGoogleAppUrl } from "@meru/shared/google";
import type { GoogleAppsPinnedApp } from "@meru/shared/types";
import { app, BrowserWindow, clipboard } from "electron";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { setupWindowContextMenu } from "@/context-menu";
import { GoogleApp, type GoogleAppOptions } from "@/google-app";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appTray } from "@/tray";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";
import { xmlParser } from "@/lib/xml";
import z from "zod";
import { createNotification } from "@/notifications";
import { ms } from "@meru/shared/ms";
import log from "electron-log";

export const GMAIL_USER_STYLES_PATH = path.join(app.getPath("userData"), "gmail-user-styles.css");

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
  ? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
  : null;

const GMAIL_PRELOAD_PATH = path.join(__dirname, "gmail-preload.js");

const inboxFeedEntrySchema = z.object({
  title: z.coerce.string(),
  summary: z.coerce.string(),
  link: z.string(),
  modified: z.string(),
  issued: z.string(),
  id: z.string(),
  author: z.object({
    name: z.coerce.string(),
    email: z.string(),
  }),
});

const inboxFeedSchema = z.object({
  feed: z.object({
    title: z.string(),
    tagline: z.string(),
    fullcount: z.number(),
    link: z.string(),
    modified: z.string(),
    entry: z.union([inboxFeedEntrySchema, z.array(inboxFeedEntrySchema)]).optional(),
  }),
});

function extractVerificationCode(texts: string[]) {
  const confidence = config.get("verificationCodes.confidence");

  let textIncludesHighConfidencePattern = false;
  let textIncludesMediumConfidencePattern = false;
  let textIncludesNegativePattern = false;

  if (confidence === "high") {
    for (const text of texts) {
      if (
        /\b(verification|sign[-\s]in|sign[-\s]up|single[-\s]use|one[-\s]time|security|authentication)\b/i.test(
          text,
        )
      ) {
        textIncludesHighConfidencePattern = true;

        break;
      }
    }
  }

  for (const text of texts) {
    if (/\bcode\b/i.test(text)) {
      textIncludesMediumConfidencePattern = true;

      break;
    }
  }

  for (const text of texts) {
    if (/\b(pick[-\s]up|delivery|collection)\b/i.test(text)) {
      textIncludesNegativePattern = true;

      break;
    }
  }

  if (
    (confidence === "high" && !textIncludesHighConfidencePattern) ||
    !textIncludesMediumConfidencePattern ||
    textIncludesNegativePattern
  ) {
    return null;
  }

  // 6-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{6})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{3}[\s-][0-9]{3})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  // 8-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{8})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{4}[\s-][0-9]{4})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(
      /\b([0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2})\b/,
    );

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  // 4-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{4})\b/);

    if (
      verificationCodeMatch?.[1] &&
      verificationCodeMatch[1] !== new Date().getFullYear().toString()
    ) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{2}[\s-][0-9]{2})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  return null;
}

export class Gmail extends GoogleApp {
  userEmail: string | null = null;

  unreadCountEnabled = true;

  store = createStore(
    subscribeWithSelector<{
      unreadCount: number;
      unreadInbox: GmailMail[];
      outOfOffice: boolean;
      messageId: string | null;
    }>(() => ({
      unreadCount: 0,
      unreadInbox: [],
      outOfOffice: false,
      messageId: null,
    })),
  );

  private previousInboxFeedModifiedDate: string | null = null;

  private previousNewMessages: Map<string, number> = new Map();

  constructor({
    accountId,
    session,
    unreadCountEnabled,
    delegatedAccountId,
  }: { unreadCountEnabled: boolean; delegatedAccountId: string | null } & Omit<
    GoogleAppOptions,
    "url"
  >) {
    const additionalArguments: string[] = [];

    if (config.get("gmail.hideGmailLogo")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideGmailLogo);
    }

    if (config.get("gmail.hideInboxFooter")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideInboxFooter);
    }

    if (config.get("gmail.reverseConversation") && licenseKey.isValid) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.reverseConversation);
    }

    if (config.get("gmail.openComposeInNewWindow") && licenseKey.isValid) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow);
    }

    if (config.get("gmail.showSenderIcons") && licenseKey.isValid) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.showSenderIcons);
    }

    if (config.get("gmail.hideOutOfOfficeBanner") && licenseKey.isValid) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideOutOfOfficeBanner);
    }

    if (config.get("gmail.moveAttachmentsToTop") && licenseKey.isValid) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.moveAttachmentsToTop);
    }

    super({
      accountId,
      url: delegatedAccountId ? createGmailDelegatedAccountUrl(delegatedAccountId) : GMAIL_URL,
      session,
      webContentsViewOptions: {
        webPreferences: {
          preload: GMAIL_PRELOAD_PATH,
          additionalArguments,
        },
      },
      hooks: {
        beforeLoadUrl: [
          (view) => {
            view.webContents.on("dom-ready", () => {
              if (view.webContents.getURL().startsWith(GMAIL_URL)) {
                view.webContents.insertCSS(gmailCSS);

                if (licenseKey.isValid && GMAIL_USER_STYLES) {
                  view.webContents.insertCSS(GMAIL_USER_STYLES);
                }
              }

              view.webContents.insertCSS(meruCSS);
            });

            view.webContents.on("did-navigate-in-page", (_event, url) => {
              const hash = new URL(url).hash;

              const messageIdMatch = hash.match(/#[^/]+\/([A-Za-z0-9]{15,})$/);

              this.store.setState({ messageId: messageIdMatch?.[1] || null });
            });
          },
        ],
      },
    });

    this.unreadCountEnabled = unreadCountEnabled;

    this.subscribeToStore();

    setInterval(() => {
      for (const [messageId, timestamp] of this.previousNewMessages) {
        if (Date.now() - timestamp > ms("5m")) {
          this.previousNewMessages.delete(messageId);
        }
      }
    }, ms("5m"));
  }

  async fetchInboxFeed(inboxType: "CLASSIC" | "SECTIONED") {
    try {
      const body = await this.session
        .fetch(`${GMAIL_INBOX_FEED_URL}${inboxType === "SECTIONED" ? "/^sq_ig_i_personal" : ""}`)
        .then((res) => res.text());

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(body));

      if (feed.modified === this.previousInboxFeedModifiedDate) {
        return;
      }

      this.previousInboxFeedModifiedDate = feed.modified;

      if (!feed.entry) {
        return;
      }

      const unreadInbox: GmailMail[] = [];
      const newMailIndexes: number[] = [];

      const now = Date.now();

      for (const [index, { id, link, title, summary, author, issued }] of (Array.isArray(feed.entry)
        ? feed.entry
        : [feed.entry]
      ).entries()) {
        const receivedAt = new Date(issued).getTime();

        unreadInbox.push({
          messageId: id,
          link,
          subject: title,
          summary,
          sender: {
            name: author.name,
            email: author.email,
          },
          receivedAt,
        });

        if (now - receivedAt < 10000 && !this.previousNewMessages.has(id)) {
          newMailIndexes.push(index);

          this.previousNewMessages.set(id, now);
        }
      }

      this.store.setState({ unreadInbox });

      const account = accounts.getAccount(this.accountId);

      for (const newMailIndex of newMailIndexes.reverse()) {
        const newMail = unreadInbox[newMailIndex];

        if (!newMail) {
          throw new Error("New mail not found");
        }

        let subtitle: string | undefined;

        if (platform.isMacOS && config.get("notifications.showSubject")) {
          subtitle = newMail.subject;
        }

        let body: string | undefined;

        if (platform.isMacOS && config.get("notifications.showSummary")) {
          body = newMail.summary;
        } else if (!platform.isMacOS && config.get("notifications.showSubject")) {
          body = newMail.subject;
        }

        if (licenseKey.isValid && config.get("verificationCodes.autoCopy")) {
          const verificationCode = extractVerificationCode(
            [subtitle, body].filter((text) => typeof text === "string"),
          );

          if (verificationCode) {
            clipboard.writeText(verificationCode);

            createNotification({
              title: config.get("notifications.showSender")
                ? newMail.sender.name
                : account.config.label,
              body: `Copied verification code ${verificationCode}`,
            });

            if (config.get("verificationCodes.autoMarkAsRead")) {
              ipc.renderer.send(
                this.view.webContents,
                "gmail.handleMessage",
                newMail.messageId,
                "markAsRead",
              );
            }

            if (config.get("verificationCodes.autoDelete")) {
              ipc.renderer.send(
                this.view.webContents,
                "gmail.handleMessage",
                newMail.messageId,
                "delete",
              );
            }

            continue;
          }
        }

        if (!config.get("notifications.enabled") || !account.config.notifications) {
          continue;
        }

        createNotification({
          title: config.get("notifications.showSender")
            ? newMail.sender.name
            : account.config.label,
          subtitle,
          body,
          actions: [
            {
              text: "Archive",
              type: "button",
            },
            {
              text: "Mark as read",
              type: "button",
            },
            {
              text: "Delete",
              type: "button",
            },
            {
              text: "Mark as spam",
              type: "button",
            },
          ],
          click: () => {
            main.show();

            accounts.selectAccount(this.accountId);

            ipc.renderer.send(this.view.webContents, "gmail.openMessage", newMail.messageId);
          },
          action: (index) => {
            switch (index) {
              case 0: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.messageId,
                  "archive",
                );

                break;
              }
              case 1: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.messageId,
                  "markAsRead",
                );

                break;
              }
              case 2: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.messageId,
                  "delete",
                );

                break;
              }
              case 3: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.messageId,
                  "markAsSpam",
                );

                break;
              }
            }
          },
        });
      }
    } catch (error) {
      log.error("Failed to fetch inbox feed", { error });
    }
  }

  setUnreadCount(unreadCount: number) {
    if (!this.unreadCountEnabled) {
      return;
    }

    this.store.setState({ unreadCount });
  }

  subscribeToStore() {
    this.viewStore.subscribe(() => {
      ipc.renderer.send(
        main.window.webContents,
        "accounts.changed",
        accounts.getAccounts().map((account) => ({
          config: account.config,
          gmail: {
            ...account.instance.gmail.store.getState(),
            ...account.instance.gmail.viewStore.getState(),
          },
        })),
      );
    });

    if (!this.unreadCountEnabled) {
      return;
    }

    if (config.get("accounts.unreadBadge")) {
      const dockUnreadBadge = config.get("dock.unreadBadge");

      this.store.subscribe(
        (state) => state.unreadCount,
        () => {
          const totalUnreadCount = accounts.getTotalUnreadCount();

          if (dockUnreadBadge) {
            if (platform.isMacOS && app.dock) {
              app.dock.setBadge(totalUnreadCount ? totalUnreadCount.toString() : "");
            } else if (platform.isLinux) {
              app.badgeCount = totalUnreadCount;
            } else if (platform.isWindows) {
              if (totalUnreadCount) {
                ipc.renderer.send(
                  main.window.webContents,
                  "taskbar.setOverlayIcon",
                  totalUnreadCount,
                );
              } else {
                main.window.setOverlayIcon(null, "");
              }
            }
          }

          appTray.updateUnreadStatus(totalUnreadCount);

          ipc.renderer.send(
            main.window.webContents,
            "accounts.changed",
            accounts.getAccounts().map((account) => ({
              config: account.config,
              gmail: {
                ...account.instance.gmail.store.getState(),
                ...account.instance.gmail.viewStore.getState(),
              },
            })),
          );
        },
      );
    }
  }

  createComposeWindow(url: string) {
    const window = new BrowserWindow({
      autoHideMenuBar: true,
      webPreferences: {
        session: this.session,
      },
    });

    setupWindowContextMenu(window);

    this.registerWindowOpenHandler(window);

    window.webContents.loadURL(`${GMAIL_URL}/?extsrc=mailto&url=${encodeURIComponent(url)}`);

    window.once("ready-to-show", () => {
      window.focus();
    });
  }

  search(query: string) {
    this.view.webContents.executeJavaScript(`window.location.hash = "#search/${query}"`);
  }

  openGoogleApp(app: GoogleAppsPinnedApp) {
    this.view.webContents.executeJavaScript(`window.open("${getGoogleAppUrl(app)}", "_blank")`);
  }
}
