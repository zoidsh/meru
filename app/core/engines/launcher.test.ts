import { describe, expect, it } from "vitest";

import type { App } from "../records/app.ts";
import { launcherApps } from "./launcher.ts";

const app = (id: string, name: string): App => ({
  hosts: [`${id}.google.com`],
  icon: "gmail",
  id,
  name,
  openBehavior: "tab",
  url: `https://${id}.google.com/`,
});

const catalog = [
  app("gmail", "Gmail"),
  app("calendar", "Calendar"),
  app("drive", "Drive"),
];

const ids = (found: readonly App[]) => found.map((entry) => entry.id);

describe(launcherApps, () => {
  it("lists the apps in the order given, skipping ids the catalog does not know", () => {
    expect(
      ids(launcherApps(catalog, ["drive", "gone", "gmail"], ""))
    ).toStrictEqual(["drive", "gmail"]);
  });

  it("keeps the apps whose name holds the query, ignoring case and the spaces around it", () => {
    expect(
      ids(launcherApps(catalog, ["gmail", "calendar", "drive"], " AL "))
    ).toStrictEqual(["calendar"]);
  });
});
