import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import type { Capability } from "#core/entitlement.ts";
import { recordInto, silentLog } from "#core/log.fake.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type {
  SessionWindow,
  SessionWindowOptions,
} from "#platform/content-view.ts";

import type { AskProfile } from "./email-links.ts";
import {
  answerIncomingLink,
  chooseProfile,
  createComposeWindows,
  createIncomingLinks,
  MAX_WAITING_LINKS,
} from "./email-links.ts";

const LINK = "mailto:someone@example.com?subject=Hello";

const stateOf = (...profiles: State["profiles"]): State => ({
  version: 1,
  profiles,
  selectedProfileId: profiles[0]?.id ?? "",
});

const ONE = stateOf(newProfile("a", "Default"));
const THREE = stateOf(
  newProfile("a", "Default"),
  { ...newProfile("b", "Off"), disabled: true },
  newProfile("c", "Work"),
  newProfile("d", "Side")
);

/** Picks the profile at `answer` of those offered, none for `"cancel"`. */
const fakeQuestion = (answer: number | "cancel") => {
  const asked: (readonly string[])[] = [];
  const question: AskProfile = (profileIds) => {
    asked.push(profileIds);

    return Promise.resolve(
      answer === "cancel" ? undefined : profileIds[answer]
    );
  };

  return { question, asked };
};

/** Lets every queued turn and its awaits run. */
const settle = () => delay(0);

describe(chooseProfile, () => {
  it("takes the one profile without asking", async () => {
    const { question, asked } = fakeQuestion(0);

    await expect(chooseProfile(ONE, question)).resolves.toBe("a");
    expect(asked).toStrictEqual([]);
  });

  it("asks among the enabled profiles in the titlebar's order", async () => {
    const { question, asked } = fakeQuestion(1);

    await expect(chooseProfile(THREE, question)).resolves.toBe("c");
    expect(asked).toStrictEqual([["a", "c", "d"]]);
  });

  it("takes the one enabled profile without asking, a disabled one never offered", async () => {
    const { question, asked } = fakeQuestion(0);
    const oneOn = stateOf(newProfile("a", "Default"), {
      ...newProfile("b", "Off"),
      disabled: true,
    });

    await expect(chooseProfile(oneOn, question)).resolves.toBe("a");
    expect(asked).toStrictEqual([]);
  });

  it("chooses none on Cancel", async () => {
    const { question } = fakeQuestion("cancel");

    await expect(chooseProfile(THREE, question)).resolves.toBeUndefined();
  });
});

const answering = ({
  state = THREE,
  answer = 0,
  pro = true,
}: {
  state?: State;
  answer?: number | "cancel";
  pro?: boolean;
} = {}) => {
  const composed: [string, string][] = [];
  const logs: string[] = [];
  let refused = 0;
  const { question, asked } = fakeQuestion(answer);
  const answer_ = answerIncomingLink({
    can: (capability: Capability) => pro && capability === "incomingLinks",
    state: () => state,
    ask: question,
    compose: (profileId, mailto) => {
      composed.push([profileId, mailto]);
    },
    refuse: () => {
      refused += 1;
    },
    log: recordInto(logs),
  });

  return { answer: answer_, composed, logs, asked, refused: () => refused };
};

describe(answerIncomingLink, () => {
  it("composes the link, whole, in the profile chosen", async () => {
    const { answer, composed } = answering({ answer: 2 });

    await answer(LINK);

    expect(composed).toStrictEqual([["d", LINK]]);
  });

  it("opens nothing on Cancel", async () => {
    const { answer, composed } = answering({ answer: "cancel" });

    await answer(LINK);

    expect(composed).toStrictEqual([]);
  });

  it("refuses without Meru Pro, once per link, asking nothing", async () => {
    const { answer, composed, asked, refused } = answering({ pro: false });

    await answer(LINK);
    await answer(LINK);

    expect(refused()).toBe(2);
    expect(composed).toStrictEqual([]);
    expect(asked).toStrictEqual([]);
  });

  it("ignores any other link, logging its scheme alone", async () => {
    const { answer, composed, logs, refused } = answering({ pro: false });

    await answer("https://example.com/private?token=1");
    await answer(`mailto:a@example.com\nbcc:b@example.com`);

    expect(composed).toStrictEqual([]);
    expect(refused()).toBe(0);
    expect(logs).toStrictEqual([
      'email-link-ignored url="another site"',
      "email-link-ignored url=mailto:",
    ]);
  });
});

describe(createIncomingLinks, () => {
  it("holds links until it starts, then answers them in order", async () => {
    const incoming = createIncomingLinks({ log: () => false });
    const answered: string[] = [];

    incoming.receive("mailto:1");
    incoming.receive("mailto:2");
    await settle();
    expect(answered).toStrictEqual([]);

    incoming.start((url) => {
      answered.push(url);

      return Promise.resolve();
    });
    incoming.receive("mailto:3");
    await settle();

    expect(answered).toStrictEqual(["mailto:1", "mailto:2", "mailto:3"]);
  });

  it("answers one at a time, a later link waiting for the question before it", async () => {
    const incoming = createIncomingLinks({ log: () => false });
    const events: string[] = [];
    const first = Promise.withResolvers<undefined>();

    incoming.start(async (url) => {
      events.push(`start ${url}`);

      if (url === "mailto:1") {
        await first.promise;
      }

      events.push(`end ${url}`);
    });
    incoming.receive("mailto:1");
    incoming.receive("mailto:2");
    await settle();
    expect(events).toStrictEqual(["start mailto:1"]);

    first.resolve(undefined);
    await settle();

    expect(events).toStrictEqual([
      "start mailto:1",
      "end mailto:1",
      "start mailto:2",
      "end mailto:2",
    ]);
  });

  it("drops a link beyond ten waiting, logging only the count, and takes links again once they are answered", async () => {
    const logs: string[] = [];
    const incoming = createIncomingLinks({
      log: recordInto(logs),
    });
    const answered: string[] = [];
    const hold = Promise.withResolvers<undefined>();

    for (let index = 1; index <= MAX_WAITING_LINKS + 1; index += 1) {
      incoming.receive(`mailto:${index}`);
    }

    expect(logs).toStrictEqual(["email-link-dropped waiting=10"]);

    incoming.start(async (url) => {
      await hold.promise;
      answered.push(url);
    });
    incoming.receive("mailto:late");
    await settle();
    expect(logs).toHaveLength(2);
    expect(logs.join("\n")).not.toContain("mailto");

    hold.resolve(undefined);
    await settle();
    expect(answered).toStrictEqual(
      Array.from(
        { length: MAX_WAITING_LINKS },
        (_, index) => `mailto:${index + 1}`
      )
    );

    incoming.receive("mailto:after");
    await settle();
    expect(answered.at(-1)).toBe("mailto:after");
  });

  it("goes on after a link whose answer failed, logging no part of it", async () => {
    const logs: string[] = [];
    const incoming = createIncomingLinks({
      log: recordInto(logs),
    });
    const answered: string[] = [];

    incoming.start((url) => {
      if (url === "mailto:secret") {
        return Promise.reject(new Error("no window"));
      }

      answered.push(url);

      return Promise.resolve();
    });
    incoming.receive("mailto:secret");
    incoming.receive("mailto:2");
    await settle();

    expect(answered).toStrictEqual(["mailto:2"]);
    expect(logs).toStrictEqual(['email-link-open-failed error="no window"']);
  });
});

const composing = (initial: State) => {
  let state = initial;
  const opened: (SessionWindowOptions & { closed: boolean })[] = [];
  const prepared: string[] = [];
  const registered: [number, unknown][] = [];
  const routed: [TabKey, string][] = [];
  const windows = createComposeWindows({
    openWindow: (options): SessionWindow => {
      const window = { ...options, closed: false };

      opened.push(window);

      return {
        close: () => {
          window.closed = true;
        },
      };
    },
    prepareSession: (partition) => {
      prepared.push(partition);
    },
    windowOpening: {
      onWindowOpen: (key, url) => {
        routed.push([key, url]);

        return "deny";
      },
      onChildNavigation: (key, url) => {
        routed.push([key, url]);

        return "allow";
      },
    },
    senders: {
      register: (id, identity) => {
        registered.push([id, identity]);

        return () => {};
      },
    },
    state: () => state,
    gmailHome: "https://mail.google.com/mail/u/0",
    background: false,
    log: silentLog,
  });

  return {
    windows,
    opened,
    prepared,
    registered,
    routed,
    setState: (next: State) => {
      state = next;
      windows.follow(next);
    },
  };
};

describe(createComposeWindows, () => {
  it("opens the compose address in the profile's readied session, routed as its Gmail tab", () => {
    const { windows, opened, prepared, registered, routed } = composing(THREE);

    windows.open("c", LINK);

    expect(prepared).toStrictEqual(["persist:c"]);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      partition: "persist:c",
      url: "https://mail.google.com/mail/u/0/?extsrc=mailto&url=mailto%3Asomeone%40example.com%3Fsubject%3DHello",
      background: false,
    });

    opened[0]?.onWindowOpen("https://example.com/");
    opened[0]?.onChildNavigation("https://mail.google.com/mail/u/0/");
    opened[0]?.onWebContents(7, "child-window");

    const gmail = { profileId: "c", tabId: "gmail" };

    expect(routed).toStrictEqual([
      [gmail, "https://example.com/"],
      [gmail, "https://mail.google.com/mail/u/0/"],
    ]);
    expect(registered).toStrictEqual([[7, { role: "child-window", ...gmail }]]);
  });

  it("registers the window and each pop-up it opens with the URL each was opened for, so a compose pop-out from it is known for one", () => {
    const { windows, opened, registered } = composing(THREE);
    const popout = "https://mail.google.com/mail/u/0/popout?ver=1#cmid%3D1";

    windows.open("c", LINK);
    opened[0]?.onWebContents(7, "child-window", opened[0].url);
    opened[0]?.onWebContents(8, "child-window", popout);

    expect(registered).toMatchObject([
      [7, { role: "child-window", openedAt: opened[0]?.url }],
      [8, { role: "child-window", openedAt: popout }],
    ]);
  });

  it("opens one for a sleeping profile, which keeps it", () => {
    const sleeping = stateOf(newProfile("a", "Default"), {
      ...newProfile("c", "Work"),
      asleep: true,
    });
    const { windows, opened, setState } = composing(sleeping);

    windows.open("c", LINK);
    setState(sleeping);

    expect(opened.map(({ closed }) => closed)).toStrictEqual([false]);
  });

  it("opens none for a profile gone or turned off", () => {
    const { windows, opened } = composing(THREE);

    windows.open("b", LINK);
    windows.open("z", LINK);

    expect(opened).toStrictEqual([]);
  });

  it("closes a profile's windows once it is removed or turned off, and no other's", () => {
    const { windows, opened, setState } = composing(THREE);

    windows.open("c", LINK);
    windows.open("d", LINK);
    windows.open("a", LINK);
    setState(stateOf(newProfile("a", "Default"), newProfile("d", "Side")));
    setState(
      stateOf(newProfile("a", "Default"), {
        ...newProfile("d", "Side"),
        disabled: true,
      })
    );

    expect(opened.map(({ closed }) => closed)).toStrictEqual([
      true,
      true,
      false,
    ]);
  });

  it("forgets a window that closed by itself", () => {
    const { windows, opened, setState } = composing(THREE);

    windows.open("c", LINK);
    opened[0]?.onClosed();
    setState(stateOf(newProfile("a", "Default")));

    expect(opened.map(({ closed }) => closed)).toStrictEqual([false]);
  });
});
