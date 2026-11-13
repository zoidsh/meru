import { describe, expect, it } from "vitest";

import { appSchema } from "../core/records/app.ts";
import { apps, gmail } from "./apps.ts";

describe("the apps catalog", () => {
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
