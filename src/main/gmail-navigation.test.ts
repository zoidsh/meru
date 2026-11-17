import { describe, expect, it } from "vitest";

import { createGmailNavigation } from "./gmail-navigation.ts";

const setup = (pageIsUp: boolean) => {
  const calls: string[] = [];
  const navigate = createGmailNavigation({
    send: (profileId, hash) => {
      calls.push(`send ${profileId} ${hash}`);

      return pageIsUp;
    },
    jumpTo: (profileId) => {
      calls.push(`jump ${profileId}`);

      return Promise.resolve();
    },
    openMessage: (profileId, url) => {
      calls.push(`open ${profileId} ${url}`);

      return Promise.resolve();
    },
    home: "https://mail.google.com/mail/u/0",
  });

  return { calls, navigate };
};

describe(createGmailNavigation, () => {
  it("moves the page that is up by its hash, then shows it", async () => {
    const { calls, navigate } = setup(true);

    await navigate("p1", "#search/%22x%22");

    expect(calls).toStrictEqual(["send p1 #search/%22x%22", "jump p1"]);
  });

  it("loads Gmail's home at the hash in a tab with no page up", async () => {
    const { calls, navigate } = setup(false);

    await navigate("p1", "#settings");

    expect(calls).toStrictEqual([
      "send p1 #settings",
      "open p1 https://mail.google.com/mail/u/0#settings",
    ]);
  });
});
