import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import {
  createGmailDelegatedAccountUrl,
  GMAIL_INBOX_FEED_URL,
  GMAIL_PRELOAD_ARGUMENTS,
  GMAIL_URL,
  type GmailInboxMessage,
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
import { log } from "@/lib/log";
import { getCascadedWindowBounds } from "@/lib/window";
import { xmlParser } from "@/lib/xml";
import z from "zod";
import { createNotification, isWithinNotificationTimes } from "@/notifications";
import { ms } from "@meru/shared/ms";
import { wait } from "@meru/shared/utils";

export const GMAIL_USER_STYLES_PATH = path.join(app.getPath("userData"), "gmail-user-styles.css");

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
  ? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
  : null;

const GMAIL_PRELOAD_PATH = path.join(__dirname, "gmail-preload.js");

const inboxFeedEntryAuthorSchema = z.object({
  name: z.coerce.string(),
  email: z.string(),
});

const inboxFeedEntrySchema = z.object({
  title: z.coerce.string(),
  summary: z.coerce.string(),
  link: z.object({
    "@_href": z.string(),
  }),
  modified: z.string(),
  issued: z.string(),
  id: z.string(),
  author: inboxFeedEntryAuthorSchema,
  contributor: z
    .union([inboxFeedEntryAuthorSchema, z.array(inboxFeedEntryAuthorSchema)])
    .optional(),
});

const inboxFeedSchema = z.object({
  feed: z.object({
    title: z.string(),
    tagline: z.string(),
    fullcount: z.number(),
    modified: z.string(),
    entry: z.union([inboxFeedEntrySchema, z.array(inboxFeedEntrySchema)]).optional(),
  }),
});

const inboxTypeSchema = z.string();

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

  unifiedInboxEnabled = true;

  store = createStore(
    subscribeWithSelector<{
      unreadCount: number;
      unreadInbox: GmailInboxMessage[];
      outOfOffice: boolean;
      messageId: string | null;
    }>(() => ({
      unreadCount: 0,
      unreadInbox: [],
      outOfOffice: false,
      messageId: null,
    })),
  );

  private isInitialInboxFeedFetch = true;

  private previousInboxFeedTotalEntries: number = 0;

  private previousNewMessages: Map<string, number> = new Map();

  constructor({
    accountId,
    session,
    unreadCountEnabled,
    unifiedInboxEnabled,
    delegatedAccountId,
  }: {
    unreadCountEnabled: boolean;
    unifiedInboxEnabled: boolean;
    delegatedAccountId: string | null;
  } & Omit<GoogleAppOptions, "url">) {
    const additionalArguments: string[] = [];

    if (config.get("gmail.hideGmailLogo")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideGmailLogo);
    }

    if (config.get("gmail.hideInboxFooter")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideInboxFooter);
    }

    if (licenseKey.isValid) {
      if (config.get("gmail.reverseConversation")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.reverseConversation);
      }

      if (config.get("gmail.openComposeInNewWindow")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow);
      }

      if (config.get("gmail.showSenderIcons")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.showSenderIcons);
      }

      if (config.get("gmail.hideOutOfOfficeBanner")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideOutOfOfficeBanner);
      }

      if (config.get("gmail.moveAttachmentsToTop")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.moveAttachmentsToTop);
      }

      if (config.get("gmail.closeComposeWindowAfterSend")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend);
      }

      if (config.get("gmail.replyForwardInPopOut")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.replyForwardInPopOut);
      }
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

    this.unifiedInboxEnabled = unifiedInboxEnabled;

    this.subscribeToStore();

    setInterval(() => {
      for (const [messageId, timestamp] of this.previousNewMessages) {
        if (Date.now() - timestamp > ms("5m")) {
          this.previousNewMessages.delete(messageId);
        }
      }
    }, ms("5m"));
  }

  async fetchInboxFeed(fetchAttempt = 1) {
    try {
      if (!this.view.webContents.getURL().startsWith(GMAIL_URL)) {
        return;
      }

      const inboxType = inboxTypeSchema.parse(
        await this.view.webContents.executeJavaScript("window.GM_INBOX_TYPE"),
      );

      const body = await this.session
        .fetch(
          `${GMAIL_INBOX_FEED_URL}${inboxType === "SECTIONED" && config.get("gmail.inboxCategoriesToMonitor") === "primary" ? "/^sq_ig_i_personal" : ""}?t=${Date.now()}`,
        )
        .then((res) => res.text());

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(body));

      const feedEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

      if (feedEntries.length === this.previousInboxFeedTotalEntries) {
        if (fetchAttempt > 10) {
          return;
        }

        await wait(ms("1s"));

        this.fetchInboxFeed(fetchAttempt + 1);

        return;
      }

      this.previousInboxFeedTotalEntries = feedEntries.length;

      const unreadInbox: GmailInboxMessage[] = [];
      const newMailIndexes: number[] = [];

      const now = Date.now();

      for (const [
        index,
        { id, link, title, summary, author, contributor, issued },
      ] of feedEntries.entries()) {
        const messageId = new URLSearchParams(link["@_href"]).get("message_id");
        const receivedAt = new Date(issued).getTime();

        if (!messageId) {
          throw new Error("Message ID not found in inbox feed entry");
        }

        unreadInbox.push({
          id: messageId,
          subject: title,
          summary,
          author: {
            name: author.name,
            email: author.email,
          },
          contributors: Array.isArray(contributor) ? contributor : contributor ? [contributor] : [],
          receivedAt,
        });

        if (now - receivedAt < ms("1m") && !this.previousNewMessages.has(id)) {
          newMailIndexes.push(index);

          this.previousNewMessages.set(id, now);
        }
      }

      if (licenseKey.isValid && config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) {
        this.store.setState({ unreadInbox });
      }

      if (this.isInitialInboxFeedFetch) {
        this.isInitialInboxFeedFetch = false;

        return;
      }

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
                ? newMail.author.name
                : account.config.label,
              body: `Copied verification code ${verificationCode}`,
            });

            if (config.get("verificationCodes.autoMarkAsRead")) {
              ipc.renderer.send(
                this.view.webContents,
                "gmail.handleMessage",
                newMail.id,
                "markAsRead",
              );
            }

            if (config.get("verificationCodes.autoDelete")) {
              ipc.renderer.send(this.view.webContents, "gmail.handleMessage", newMail.id, "delete");
            }

            continue;
          }
        }

        if (
          !config.get("notifications.enabled") ||
          !account.config.notifications ||
          config.get("doNotDisturb.enabled") ||
          !isWithinNotificationTimes()
        ) {
          continue;
        }

        createNotification({
          title: config.get("notifications.showSender")
            ? newMail.author.name
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

            ipc.renderer.send(this.view.webContents, "gmail.openMessage", newMail.id);
          },
          action: (index) => {
            switch (index) {
              case 0: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "archive",
                );

                break;
              }
              case 1: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "markAsRead",
                );

                break;
              }
              case 2: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "delete",
                );

                break;
              }
              case 3: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
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

  getIsUnreadCountEnabled() {
    if (!config.get("accounts.unreadBadge")) {
      return false;
    }

    return this.unreadCountEnabled;
  }

  setUnreadCount(unreadCount: number) {
    if (this.getIsUnreadCountEnabled()) {
      this.store.setState({ unreadCount });
    }
  }

  subscribeToStore() {
    this.viewStore.subscribe(() => {
      accounts.sendAccountsChangedToRenderer();
    });

    if (this.getIsUnreadCountEnabled()) {
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

    if (licenseKey.isValid && config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) {
      this.store.subscribe(
        (state) => state.unreadInbox,
        () => {
          accounts.sendAccountsChangedToRenderer();
        },
      );
    }
  }

  createComposeWindow(url: string) {
    const window = new BrowserWindow({
      ...getCascadedWindowBounds({ width: 800, height: 600 }),
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
