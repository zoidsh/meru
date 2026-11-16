import { describe, expect, it } from "vitest";

import { APPS, appForUrl, findApp, restoreUrl, standInApps } from "./apps.ts";

const claimed = (url: string) => appForUrl(APPS, url)?.id;

describe(appForUrl, () => {
  it.each([
    ["https://mail.google.com/mail/u/0/#inbox", "gmail"],
    ["https://calendar.google.com/calendar/r", "calendar"],
    ["https://drive.google.com/drive/my-drive", "drive"],
    ["https://drive.usercontent.google.com/download?id=1", "drive"],
    ["https://meet.google.com/abc-defg-hij", "meet"],
    ["https://sheets.google.com/", "sheets"],
    ["https://slides.google.com/", "slides"],
    // Docs, Sheets and Slides share docs.google.com, told apart by path.
    ["https://docs.google.com/document/d/1/edit", "docs"],
    ["https://docs.google.com/spreadsheets/d/1", "sheets"],
    ["https://docs.google.com/presentation/d/1", "slides"],
    ["https://docs.google.com/u/1/spreadsheets/d/1", "sheets"],
    ["https://docs.google.com/a/example.com/presentation/d/1", "slides"],
    // As in v3, anything else on the host stays Docs.
    ["https://docs.google.com/forms/d/1", "docs"],
    ["https://docs.google.com/", "docs"],
  ])("claims %s for %s", (url, app) => {
    expect(claimed(url)).toBe(app);
  });

  it("claims nothing for a look-alike host, a claimed host elsewhere in the URL, or credentials", () => {
    for (const url of [
      "https://calendar.google.com.evil.com/",
      "https://evilcalendar.google.com/",
      "https://evil.com/calendar.google.com/",
      "https://evil.com/?u=https://calendar.google.com",
      "https://calendar.google.com@evil.com/",
      "https://someone@calendar.google.com/",
      "https://www.google.com/calendar",
      "https://google.com/",
      "https://research.google.com/",
      "ftp://calendar.google.com/",
      "not a url",
    ]) {
      expect(claimed(url)).toBeUndefined();
    }
  });

  it("claims the plain http origin only where a stand-in names it", () => {
    expect(claimed("http://calendar.google.com/")).toBeUndefined();
  });
});

describe(standInApps, () => {
  it("claims only each stand-in's origin, which is also where the app starts", () => {
    const apps = standInApps({ drive: "http://127.0.0.1:3000/drive" });

    expect(findApp(apps, "drive")).toMatchObject({
      home: "http://127.0.0.1:3000/drive",
      claims: [{ origin: "http://127.0.0.1:3000" }],
    });
    expect(appForUrl(apps, "http://127.0.0.1:3000/elsewhere")?.id).toBe(
      "drive"
    );
    expect(appForUrl(apps, "https://calendar.google.com/")).toBeUndefined();
  });
});

describe(restoreUrl, () => {
  const calendar = findApp(APPS, "calendar");
  const gmail = findApp(APPS, "gmail");

  it("reopens a tab where it was while its app claims the URL", () => {
    expect(
      calendar &&
        restoreUrl(
          APPS,
          calendar,
          "https://calendar.google.com/calendar/r/week"
        )
    ).toBe("https://calendar.google.com/calendar/r/week");
  });

  it("reopens at the app's home when it had browsed off the app", () => {
    for (const url of [
      "https://accounts.google.com/ServiceLogin",
      "https://example.com/",
      "https://drive.google.com/",
      "",
    ]) {
      expect(calendar && restoreUrl(APPS, calendar, url)).toBe(
        "https://calendar.google.com"
      );
    }
  });

  it("always reopens Gmail at its home, as v3 does", () => {
    expect(
      gmail &&
        restoreUrl(APPS, gmail, "https://mail.google.com/mail/u/0/#inbox/abc")
    ).toBe("https://mail.google.com/mail/u/0");
  });
});
