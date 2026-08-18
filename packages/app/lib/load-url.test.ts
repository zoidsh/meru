import { describe, expect, test } from "bun:test";
import type { NavigationEntry, RestoreOptions, WebContents } from "electron";
import { restoreNavigationHistory } from "./load-url";

function makeWebContents(restore: (options: RestoreOptions) => Promise<void>) {
  return {
    navigationHistory: { restore },
  } as unknown as WebContents;
}

const entries: NavigationEntry[] = [
  { url: "https://mail.google.com/", title: "Inbox", pageState: "state-0" },
  { url: "https://calendar.google.com/", title: "Calendar", pageState: "state-1" },
];

describe("restoreNavigationHistory", () => {
  test("hands the entries and the active index to the view", async () => {
    let restoredOptions: RestoreOptions | undefined;

    const restored = await restoreNavigationHistory(
      makeWebContents(async (options) => {
        restoredOptions = options;
      }),
      { entries, index: 1 },
    );

    expect(restored).toBe(true);
    expect(restoredOptions).toEqual({ entries, index: 1 });
  });

  test("answers false instead of rejecting when the page fails to load", async () => {
    const restored = await restoreNavigationHistory(
      makeWebContents(() => Promise.reject(new Error("ERR_NAME_NOT_RESOLVED"))),
      { entries, index: 1 },
    );

    expect(restored).toBe(false);
  });
});
