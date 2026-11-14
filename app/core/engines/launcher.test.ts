import { describe, expect, it } from "vitest";

import type { App, AppId } from "../records/app.ts";
import { launcherApps } from "./launcher.ts";

const app = (id: AppId, name: string): App => ({
  hosts: [`${id}.google.com`],
  icon: "gmail",
  id,
  name,
  openBehavior: "tab",
  url: `https://${id}.google.com/`,
});

const catalog = [
  { ...app("gmail", "Gmail"), singleInstance: true },
  app("calendar", "Calendar"),
  app("drive", "Drive"),
];

const ids = (found: readonly App[]) => found.map((entry) => entry.id);

describe(launcherApps, () => {
  it("lists the apps in the order given, skipping ids the catalog does not know", () => {
    expect(
      ids(launcherApps(catalog, ["drive", "gone", "calendar"], ""))
    ).toStrictEqual(["drive", "calendar"]);
  });

  it("leaves out the single-instance apps, whose one tab is always open", () => {
    expect(ids(launcherApps(catalog, ["gmail", "calendar"], ""))).toStrictEqual(
      ["calendar"]
    );
  });

  it("keeps the apps whose name holds the query, ignoring case and the spaces around it", () => {
    expect(
      ids(launcherApps(catalog, ["gmail", "calendar", "drive"], " AL "))
    ).toStrictEqual(["calendar"]);
  });
});
