import { describe, expect, it } from "vitest";

import type { App } from "../records/app.ts";
import type { Group } from "../records/group.ts";
import type { Tab } from "../records/tab.ts";
import { leaf } from "./layout.ts";
import { appOfUrl, resolveLinkTarget } from "./links.ts";
import type { LinkContext, LinkSettings } from "./links.ts";

const app = (id: string, hosts: string[], more: Partial<App> = {}): App => ({
  hosts,
  icon: id,
  id,
  name: id,
  openBehavior: "tab",
  url: `https://${hosts[0] ?? ""}/`,
  ...more,
});

const catalog: readonly App[] = [
  app("gmail", ["mail.google.com"], { singleInstance: true }),
  app("calendar", ["calendar.google.com"]),
  app("docs", ["docs.google.com"]),
  app("sheets", ["sheets.google.com", "docs.google.com/spreadsheets"]),
  app("meet", ["meet.google.com"], { openBehavior: "window" }),
];

const tab = (id: string, appId: string, url: string): Tab => ({
  appId,
  health: "ok",
  id,
  pinned: false,
  profileId: "work",
  sleeping: false,
  title: appId,
  url,
  zoom: 1,
});

const gmail = tab("t-gmail", "gmail", "https://mail.google.com/mail/u/0/");
const calendar = tab("t-cal", "calendar", "https://calendar.google.com/");
const docs = tab("t-docs", "docs", "https://docs.google.com/document/d/1");
const tabs = [gmail, calendar, docs];
const groups: Group[] = tabs.map((found) => ({
  id: `g-${found.id}`,
  layout: leaf(`p-${found.id}`, found.id),
  profileId: "work",
  tabIds: [found.id],
}));

const settings: LinkSettings = {
  excludedApps: [],
  mode: "tabs",
  openInApp: true,
};

const context = (from: Tab, more: Partial<LinkContext> = {}): LinkContext => ({
  catalog,
  from,
  groups,
  settings,
  tabs,
  ...more,
});

describe(appOfUrl, () => {
  it("finds the app by host, a subdomain of it, or a host and path segment, past an account prefix", () => {
    expect(
      [
        "https://mail.google.com/mail/u/0/#inbox",
        "https://docs.google.com/document/d/1",
        "https://docs.google.com/spreadsheets/d/1",
        "https://docs.google.com/u/1/spreadsheets/d/1",
        "https://docs.google.com/a/example.com/spreadsheets/d/1",
        "https://sub.calendar.google.com/",
        "https://research.google.com/",
        "https://example.com/",
        "mailto:someone@example.com",
      ].map((url) => appOfUrl(url, catalog)?.id)
    ).toStrictEqual([
      "gmail",
      "docs",
      "sheets",
      "sheets",
      "sheets",
      "calendar",
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe(resolveLinkTarget, () => {
  it("keeps a link to the same app on the same host in the pane", () => {
    expect(
      resolveLinkTarget(
        "https://mail.google.com/mail/u/0/#inbox/abc",
        context(gmail)
      )
    ).toStrictEqual({ action: "samePane" });
  });

  it("opens a link to another app of the catalog in its tab, or a new one", () => {
    expect(
      resolveLinkTarget("https://calendar.google.com/r/day", context(gmail))
    ).toStrictEqual({
      action: "newTab",
      appId: "calendar",
      background: false,
      tabId: calendar.id,
    });
    expect(
      resolveLinkTarget(
        "https://docs.google.com/spreadsheets/d/1",
        context(docs)
      )
    ).toStrictEqual({ action: "newTab", appId: "sheets", background: false });
  });

  it("focuses the one Gmail tab for a Gmail link from another app", () => {
    expect(
      resolveLinkTarget(
        "https://mail.google.com/mail/u/0/#inbox/abc",
        context(calendar, { disposition: "window" })
      )
    ).toStrictEqual({
      action: "newTab",
      appId: "gmail",
      background: false,
      tabId: gmail.id,
    });
  });

  it("opens a window when the click, the setting or the app asks for one", () => {
    const url = "https://calendar.google.com/";
    expect([
      resolveLinkTarget(url, context(gmail, { disposition: "window" })),
      resolveLinkTarget(
        url,
        context(gmail, { settings: { ...settings, mode: "windows" } })
      ),
      resolveLinkTarget("https://meet.google.com/abc", context(gmail)),
    ]).toStrictEqual([
      { action: "window", appId: "calendar" },
      { action: "window", appId: "calendar" },
      { action: "window", appId: "meet" },
    ]);
  });

  it("opens a background tab for a click that asks for one", () => {
    expect(
      resolveLinkTarget(
        "https://calendar.google.com/",
        context(gmail, { disposition: "background" })
      )
    ).toMatchObject({ action: "newTab", background: true });
  });

  it("sends anything else to the browser: another site, an excluded app, or every app when Google apps open outside", () => {
    expect([
      resolveLinkTarget("https://example.com/", context(gmail)),
      resolveLinkTarget(
        "https://calendar.google.com/",
        context(gmail, {
          settings: { ...settings, excludedApps: ["calendar"] },
        })
      ),
      resolveLinkTarget(
        "https://calendar.google.com/",
        context(gmail, { settings: { ...settings, openInApp: false } })
      ),
    ]).toStrictEqual([
      { action: "external" },
      { action: "external" },
      { action: "external" },
    ]);
  });
});
