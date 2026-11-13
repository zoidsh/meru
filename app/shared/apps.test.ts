import { describe, expect, it } from "vitest";

import { appOfUrl } from "../core/engines/links.ts";
import { appIdSchema, appSchema } from "../core/records/app.ts";
import { appIds, apps, gmail } from "./apps.ts";

describe("the apps catalog", () => {
  it("holds one app per id, in the order the ids are declared", () => {
    expect(appIds).toStrictEqual(appIdSchema.options);
  });

  it("parses every entry", () => {
    for (const app of apps) {
      expect(appSchema.parse(app)).toStrictEqual(app);
    }
  });

  it("gives every app a url on a Google host it claims", () => {
    for (const app of apps) {
      const hostname = /^https:\/\/(?<host>[^/]+)\//u.exec(app.url)?.groups
        ?.host;
      expect(hostname).toMatch(/^[a-z]+\.google\.com$/u);
      expect(app.hosts).toContain(hostname);
    }
  });

  it("has unique ids and puts Gmail first, as the one single-instance app", () => {
    const ids = apps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(gmail.id);
    expect(
      apps.filter((app) => app.singleInstance === true).map((app) => app.id)
    ).toStrictEqual([gmail.id]);
  });

  it("claims each host or path for one app only", () => {
    const hosts = apps.flatMap((app) => app.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
});

describe("a link's app, from the catalog", () => {
  it.each([
    ["https://admin.google.com/ac/home", "admin"],
    ["https://calendar.google.com/calendar/u/0/r", "calendar"],
    ["https://drive.google.com/drive/u/0/my-drive", "drive"],
    ["https://script.google.com/home", "appsScript"],
    [
      "https://search.google.com/search-console?resource_id=abc123",
      "searchConsole",
    ],
    ["https://docs.google.com/document/d/abc123/edit", "docs"],
    ["https://docs.google.com/spreadsheets/d/abc123/edit", "sheets"],
    ["https://docs.google.com/presentation/d/abc123/edit", "slides"],
    ["https://docs.google.com/forms/d/abc123/edit", "forms"],
    ["https://docs.google.com/videos?usp=direct_url", "vids"],
    ["https://docs.google.com/u/1/spreadsheets/d/abc123/edit", "sheets"],
    [
      "https://docs.google.com/a/example.com/presentation/d/abc123/edit",
      "slides",
    ],
    ["https://docs.google.com/spreadsheets?usp=sheets_home", "sheets"],
    ["https://docs.google.com/drawings/d/abc123/edit", "docs"],
    ["https://drive.usercontent.google.com/download?id=abc123", "drive"],
    ["https://notebooklm.google.com/notebook/abc123", "notebook"],
    ["https://myaccount.google.com/", "myaccount"],
    ["https://mail.google.com/mail/u/0/#inbox", "gmail"],
    ["https://research.google.com/", undefined],
    ["https://example.com/spreadsheets/d/abc123", undefined],
  ])("finds that %s is %s, as 3.x did", (url, id) => {
    expect(appOfUrl(url, apps)?.id).toBe(id);
  });
});
