import { describe, expect, it } from "vitest";

import { unwrap } from "../../../test/result.ts";
import { testApp, testStages } from "../../testing.ts";

describe("a pane's content preload", () => {
  it("runs the preload its app gives, attached while the tab's view lasts", async () => {
    const app = await testApp();
    const attached: string[] = [];
    const { open, views } = testStages(app, {
      content: (tab) =>
        tab.appId === "gmail"
          ? undefined
          : {
              arguments: ["--meru-surface=google"],
              attach: (contentsId) => {
                attached.push(`${tab.id} ${contentsId}`);
                return () => {
                  attached.push(`${tab.id} gone`);
                };
              },
              preload: "/dist/preload/google.cjs",
            },
    });
    open();
    const [gmail] = app.profiles.state.tabs;
    if (gmail === undefined) {
      throw new Error("A first launch has a Gmail tab");
    }
    const drive = unwrap(app.profiles.openTab(gmail.profileId, "drive"));
    unwrap(app.profiles.focusTab(drive.id));
    const made = views.created.at(-1);
    expect(views.created[0]?.spec.preload).toBeUndefined();
    expect(made?.spec).toMatchObject({
      arguments: ["--meru-surface=google"],
      preload: "/dist/preload/google.cjs",
    });
    unwrap(app.profiles.closeTab(drive.id));
    expect(attached).toStrictEqual([
      `${drive.id} ${made?.contentsId}`,
      `${drive.id} gone`,
    ]);
  });
});
