import type { GmailState } from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import type { AccountConfig, AccountInstance } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, type TabState } from "@meru/shared/tabs";
import type { DownloadItem } from "@meru/shared/types";
import { PLAYGROUND_ACCOUNT_ID } from "./constants";
import type { Scenario } from "./types";

/**
 * A download's `createdAt` is a unix timestamp in seconds, which is what
 * Electron reports as a download's start time.
 */
function unixSecondsAgo(millisecondsAgo: number): number {
  return Math.round((Date.now() - millisecondsAgo) / 1000);
}

function createDownload(
  fileName: string,
  { createdAt, exists = true }: { createdAt: number; exists?: boolean },
): DownloadItem {
  return {
    id: fileName,
    fileName,
    filePath: `/home/you/Downloads/${fileName}`,
    createdAt,
    exists,
  };
}

const downloadHistory: DownloadItem[] = [
  createDownload("Q3 revenue.pdf", { createdAt: unixSecondsAgo(ms("40s")) }),
  createDownload("team-offsite-photos.zip", { createdAt: unixSecondsAgo(ms("2h")) }),
  createDownload("contract-countersigned.pdf", { createdAt: unixSecondsAgo(ms("3d")) }),
  createDownload("logo-mark.svg", { createdAt: unixSecondsAgo(ms("3w")) }),
];

function createAccount({
  id,
  label,
  color = null,
  selected = false,
  gmail,
}: {
  id: string;
  label: string;
  color?: AccountConfig["color"];
  selected?: boolean;
  gmail?: Partial<GmailState>;
}): AccountInstance {
  return {
    config: {
      id,
      label,
      color,
      selected,
      notifications: true,
      gmail: {
        unreadBadge: true,
        delegatedAccountId: null,
        unifiedInbox: true,
      },
      workspaceApps: {
        savedTabs: [],
        bookmarks: [],
      },
    },
    gmail: {
      unreadCount: null,
      unreadInbox: [],
      outOfOffice: false,
      attentionRequired: false,
      ...gmail,
    },
    verticalTabsWidth: null,
  };
}

const playgroundAccount = createAccount({
  id: PLAYGROUND_ACCOUNT_ID,
  label: "Work",
  color: "blue",
  selected: true,
  gmail: { unreadCount: 12 },
});

const personalAccount = createAccount({
  id: "playground-account-personal",
  label: "Personal",
  color: "emerald",
  gmail: { unreadCount: 3 },
});

const consultingAccount = createAccount({
  id: "playground-account-consulting",
  label: "Consulting",
  color: "amber",
  gmail: { attentionRequired: true, outOfOffice: true },
});

function createTab(tab: Pick<TabState, "id" | "title"> & Partial<TabState>): TabState {
  return {
    app: undefined,
    pinned: false,
    dormant: false,
    windowed: false,
    bookmarked: false,
    opensLinksForApp: null,
    loadOnLaunch: false,
    loading: false,
    navigationHistory: { canGoBack: false, canGoForward: false },
    active: false,
    ...tab,
  };
}

const gmailTab = createTab({
  id: GMAIL_TAB_ID,
  app: "gmail",
  title: "Gmail",
  pinned: true,
  active: true,
  navigationHistory: { canGoBack: true, canGoForward: false },
});

function accountTabs(tabs: TabState[]) {
  return [{ accountId: PLAYGROUND_ACCOUNT_ID, tabs }];
}

const PLAYGROUND_LICENSE_KEY = "MERU-PLAYGROUND-KEY";

/**
 * Every state the playground can be put into, as data. A scenario names the
 * call site it renders, what the config says while it renders, and the events
 * pushed at it once it has mounted.
 */
export const scenarios: Scenario[] = [
  {
    id: "download-history-empty",
    name: "Nothing downloaded yet",
    description: "The empty state, which is what a fresh install shows.",
    component: "downloadHistoryList",
    config: { "downloads.history": [] },
  },
  {
    id: "download-history-populated",
    name: "Four downloads",
    description:
      "Ages spanning seconds to weeks, so the relative timestamps each read differently. Removing one goes through the real mutation and the config comes back changed.",
    component: "downloadHistoryList",
    config: { "downloads.history": downloadHistory },
  },
  {
    id: "download-history-files-gone",
    name: "Files moved or deleted",
    description:
      "Two of the four no longer exist on disk, so they lose their timestamp, their folder button and their click target.",
    component: "downloadHistoryList",
    config: {
      "downloads.history": downloadHistory.map((download, index) =>
        index % 2 === 1 ? { ...download, exists: false } : download,
      ),
    },
  },
  {
    id: "download-history-limited",
    name: "More downloads than the popup shows",
    description:
      "Fourteen downloads through the call site the recent-downloads popup uses, which cuts the list off at ten.",
    component: "recentDownloadHistoryList",
    config: {
      "downloads.history": Array.from({ length: 14 }, (_unused, index) =>
        createDownload(`attachment-${index + 1}.pdf`, {
          createdAt: unixSecondsAgo(ms("1h") * (index + 1)),
        }),
      ),
    },
  },
  {
    id: "find-in-page-matches",
    name: "Searching with matches",
    description:
      "Activated and sitting on the third of twelve matches. Typing sends `findInPage`, which the call log below records.",
    component: "findInPage",
    events: [
      { channel: "findInPage.activate", args: [] },
      { channel: "findInPage.result", args: [{ activeMatch: 3, totalMatches: 12 }] },
    ],
  },
  {
    id: "find-in-page-no-matches",
    name: "Searching with no matches",
    description: "Activated with nothing found, which is the zero-of-zero counter.",
    component: "findInPage",
    events: [
      { channel: "findInPage.activate", args: [] },
      { channel: "findInPage.result", args: [{ activeMatch: 0, totalMatches: 0 }] },
    ],
  },
  {
    id: "find-in-page-closed",
    name: "Not searching",
    description: "Never activated, so the component renders nothing at all.",
    component: "findInPage",
  },
  {
    id: "license-required-trial-over",
    name: "Trial over, unlicensed",
    description: "No trial days left and no license key, which is when the banner appears.",
    component: "licenseKeyRequiredBanner",
    config: { licenseKey: null },
  },
  {
    id: "license-required-trial-running",
    name: "Trial running",
    description: "Seven days left pushed through `trial.daysLeftChanged`, which hides the banner.",
    component: "licenseKeyRequiredBanner",
    config: { licenseKey: null },
    events: [{ channel: "trial.daysLeftChanged", args: [7] }],
  },
  {
    id: "license-required-licensed",
    name: "Licensed",
    description: "A license key in the config, which hides the banner just as the trial does.",
    component: "licenseKeyRequiredBanner",
    config: { licenseKey: PLAYGROUND_LICENSE_KEY },
  },
  {
    id: "vertical-tabs-gmail-only",
    name: "Gmail alone",
    description: "One account with nothing open but Gmail, carrying an unread count.",
    component: "verticalTabs",
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      {
        channel: "tabs.changed",
        args: [[{ accountId: PLAYGROUND_ACCOUNT_ID, tabs: [gmailTab] }]],
      },
    ],
  },
  {
    id: "vertical-tabs-mixed",
    name: "Pinned, open, windowed and dormant tabs",
    description:
      "Both sections filled, with a windowed app, a dormant pinned one, and a tab holding another app's links — every badge the strip can draw.",
    component: "verticalTabs",
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      {
        channel: "tabs.changed",
        args: [
          [
            {
              accountId: PLAYGROUND_ACCOUNT_ID,
              tabs: [
                gmailTab,
                createTab({
                  id: "calendar",
                  app: "calendar",
                  title: "Calendar",
                  pinned: true,
                  opensLinksForApp: "calendar",
                }),
                createTab({
                  id: "drive",
                  app: "drive",
                  title: "Drive",
                  pinned: true,
                  dormant: true,
                }),
                createTab({ id: "meet", app: "meet", title: "Meet", windowed: true }),
                createTab({
                  id: "docs",
                  app: "docs",
                  title: "Roadmap — Google Docs",
                  bookmarked: true,
                }),
                createTab({ id: "sheets", app: "sheets", title: "Headcount", loading: true }),
              ],
            },
          ],
        ],
      },
    ],
  },
  {
    id: "vertical-tabs-wide",
    name: "Widened strip with the launcher",
    description:
      "The wide strip, which labels every tab and puts the Workspace Apps launcher above the bookmarks button. The launcher needs a license, so this scenario carries one.",
    component: "verticalTabs",
    config: {
      licenseKey: PLAYGROUND_LICENSE_KEY,
      "verticalTabs.width": "wide",
      "workspaceApps.launcherApps": ["calendar", "drive", "keep", "tasks"],
    },
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      {
        channel: "tabs.changed",
        args: [
          [
            {
              accountId: PLAYGROUND_ACCOUNT_ID,
              tabs: [
                gmailTab,
                createTab({ id: "calendar", app: "calendar", title: "Calendar", pinned: true }),
                createTab({ id: "docs", app: "docs", title: "Roadmap — Google Docs" }),
                createTab({ id: "sheets", app: "sheets", title: "Headcount" }),
              ],
            },
          ],
        ],
      },
    ],
  },
  {
    id: "titlebar-gmail-only",
    name: "One account, Gmail alone",
    description:
      "Nothing open but Gmail, so the tab strip is not there and the titlebar hosts the Workspace Apps launcher and the bookmarks button itself.",
    component: "appTitlebar",
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      { channel: "tabs.changed", args: [accountTabs([gmailTab])] },
    ],
  },
  {
    id: "titlebar-tabs-open",
    name: "Tabs open, controls handed over",
    description:
      "With a tab strip beside it, the titlebar hands the launcher and the bookmarks button over to the strip and fades its own group out.",
    component: "appTitlebar",
    config: { "workspaceApps.launcherApps": ["calendar", "drive", "keep"] },
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      {
        channel: "tabs.changed",
        args: [
          accountTabs([
            gmailTab,
            createTab({ id: "docs", app: "docs", title: "Roadmap — Google Docs" }),
            createTab({ id: "sheets", app: "sheets", title: "Headcount" }),
          ]),
        ],
      },
    ],
  },
  {
    id: "titlebar-multiple-accounts",
    name: "Three accounts",
    description:
      "Account buttons with their colors, unread counts, an account wanting attention and one out of office. The unified inbox button needs a license and more than one account, so both are here.",
    component: "appTitlebar",
    config: { licenseKey: PLAYGROUND_LICENSE_KEY },
    events: [
      {
        channel: "accounts.changed",
        args: [[playgroundAccount, personalAccount, consultingAccount]],
      },
      { channel: "tabs.changed", args: [accountTabs([gmailTab])] },
    ],
  },
  {
    id: "titlebar-trial-ending",
    name: "Trial with two days left",
    description:
      "The trial badge, which turns red at three days or fewer. Do Not Disturb is missing because the trial is what stands in for a license, and it has not been pushed yet when the badge is read.",
    component: "appTitlebar",
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      { channel: "tabs.changed", args: [accountTabs([gmailTab])] },
      { channel: "trial.daysLeftChanged", args: [2] },
    ],
  },
  {
    id: "titlebar-update-available",
    name: "Update available",
    description:
      "An update pushed through `appUpdater.updateAvailable`. The button opens the detail row, which takes over the whole titlebar.",
    component: "appTitlebar",
    config: { licenseKey: PLAYGROUND_LICENSE_KEY },
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      { channel: "tabs.changed", args: [accountTabs([gmailTab])] },
      { channel: "appUpdater.updateAvailable", args: ["3.60.0"] },
    ],
  },
  {
    id: "titlebar-everything-on",
    name: "Saved searches, launcher and extensions",
    description:
      "Every optional control at once, with the launcher pinned to the titlebar rather than left to the strip. The extensions button reads `extensions.getActions`, which is the one scenario here fixturing an invoke.",
    component: "appTitlebar",
    config: {
      licenseKey: PLAYGROUND_LICENSE_KEY,
      "workspaceApps.launcherAndBookmarksPlacement": "titlebar",
      "workspaceApps.launcherApps": ["calendar", "drive", "keep", "tasks"],
      "workspaceApps.launcherDisplay": "expanded",
      "extensions.showTitlebarButton": true,
      "gmail.savedSearches": [
        { id: "unread", label: "Unread", query: "is:unread" },
        { id: "attachments", label: "With attachments", query: "has:attachment" },
      ],
      "doNotDisturb.enabled": true,
    },
    invoke: {
      "extensions.getActions": [
        { extensionId: "1password", title: "1Password", iconDataUrl: null },
      ],
    },
    events: [
      { channel: "accounts.changed", args: [[playgroundAccount]] },
      { channel: "tabs.changed", args: [accountTabs([gmailTab])] },
    ],
  },
];
