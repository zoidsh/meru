import { describe, expect, it } from "vitest";

import { GMAIL_CHANNELS } from "#contract/gmail.ts";
import type { GmailFeatures, GmailHealth } from "#contract/gmail.ts";
import {
  GMAIL_HASH_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  searchHash,
} from "#core/gmail-hash.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import { serveGmailContract } from "./gmail-page.ts";
import { createSenderRegistry } from "./senders.ts";

const GMAIL_ORIGIN = "https://mail.google.com";

const GMAIL_VIEW = 11;
const CALENDAR_VIEW = 12;
const CHILD_WINDOW = 13;
const SHELL = 1;

const ON: GmailFeatures = {
  hideGmailLogo: true,
  hideInboxFooter: true,
  hidePromoBanner: true,
  hideUpgradeButton: true,
  reverseConversation: true,
  moveAttachmentsToTop: false,
  showTrimmedContent: true,
};

const HEALTH: GmailHealth = {
  views: ["list"],
  hooks: {
    logo: "matched",
    footer: "broken",
    promo: "absent",
    upgrade: "matched",
    conversation: "matched",
    attachments: "matched",
    trimmed: "matched",
    trimmedToggle: "matched",
    refresh: "matched",
  },
  ms: 2,
};

const from = (
  webContentsId: number,
  overrides: Partial<IpcSender> = {}
): IpcSender => ({
  webContentsId,
  isMainFrame: true,
  origin: GMAIL_ORIGIN,
  ...overrides,
});

const setup = (
  userStyles: () => Promise<string> = () => Promise.resolve("")
) => {
  const listeners = new Map<
    string,
    (sender: IpcSender, payload: unknown) => void
  >();
  const sent: {
    to: number;
    channel: string;
    message: unknown;
    options: unknown;
  }[] = [];
  const logs: string[] = [];
  const reports: (TabKey & GmailHealth)[] = [];
  const refused: (string | undefined)[] = [];
  let features = ON;
  const senders = createSenderRegistry();
  /** Views whose main frame is off Gmail's origin and has not shaken hands. */
  const away = new Set<number>();

  senders.register(SHELL, { role: "shell" });
  const dropGmailView = senders.register(GMAIL_VIEW, {
    role: "content-view",
    profileId: "a",
    tabId: "gmail",
  });
  senders.register(CALENDAR_VIEW, {
    role: "content-view",
    profileId: "a",
    tabId: "c1",
  });
  senders.register(CHILD_WINDOW, {
    role: "child-window",
    profileId: "a",
    tabId: "gmail",
  });

  const ipc: Pick<Ipc, "on" | "send"> = {
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    send: (to, channel, message, options) => {
      if (away.has(to)) {
        return false;
      }

      sent.push({ to, channel, message, options });

      return true;
    },
  };

  const page = serveGmailContract({
    ipc,
    senders,
    isGmailTab: (key) => key.tabId === "gmail",
    gmailOrigin: GMAIL_ORIGIN,
    features: () => features,
    userStyles,
    onHealth: (key, health) => reports.push({ ...key, ...health }),
    onRefused: (origin) => refused.push(origin),
    log: (message) => logs.push(message),
  });

  const emit = (channel: string, sender: IpcSender, payload?: unknown) => {
    listeners.get(channel)?.(sender, payload);
  };

  return {
    page,
    sent,
    logs,
    reports,
    refused,
    senders,
    dropGmailView,
    leave: (webContentsId: number) => away.add(webContentsId),
    shake: (sender: IpcSender) => emit(GMAIL_CHANNELS.sync, sender),
    report: (sender: IpcSender, payload: unknown) =>
      emit(GMAIL_CHANNELS.health, sender, payload),
    setFeatures: (next: GmailFeatures) => {
      features = next;
    },
  };
};

describe(serveGmailContract, () => {
  it("answers a Gmail view's handshake with the switches, for its main frame on Gmail's origin alone", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));

    expect(contract.sent).toStrictEqual([
      {
        to: GMAIL_VIEW,
        channel: GMAIL_CHANNELS.features,
        message: ON,
        options: { mainFrameOrigin: GMAIL_ORIGIN },
      },
    ]);
  });

  it("refuses a handshake from anything but a Gmail view's main frame on Gmail's origin, logging only the origin", () => {
    const contract = setup();

    for (const sender of [
      from(CALENDAR_VIEW),
      from(CHILD_WINDOW),
      from(SHELL),
      from(99),
      from(GMAIL_VIEW, { isMainFrame: false }),
      from(CALENDAR_VIEW, { origin: "https://calendar.google.com" }),
    ]) {
      contract.shake(sender);
    }

    expect(contract.sent).toStrictEqual([]);
    expect(contract.refused).toStrictEqual([
      GMAIL_ORIGIN,
      GMAIL_ORIGIN,
      GMAIL_ORIGIN,
      GMAIL_ORIGIN,
      GMAIL_ORIGIN,
      "https://calendar.google.com",
    ]);
    expect(contract.logs).toContain(
      `Refused Gmail's handshake from webContents ${CALENDAR_VIEW} (main frame, https://calendar.google.com)`
    );
  });

  it("answers nothing, and says nothing, when a Gmail view's page is on another origin, as sign-in and error pages are", () => {
    const contract = setup();

    for (const origin of ["https://accounts.google.com", "null", undefined]) {
      contract.shake(from(GMAIL_VIEW, { origin }));
    }

    expect(contract.sent).toStrictEqual([]);
    expect(contract.refused).toStrictEqual([]);
    expect(contract.logs).toStrictEqual([]);
  });

  it("pushes a change of the switches to each page that shook hands", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));
    contract.shake(from(CALENDAR_VIEW));
    contract.setFeatures({ ...ON, hideInboxFooter: false });
    contract.page.push();

    expect(contract.sent.map(({ to, message }) => [to, message])).toStrictEqual(
      [
        [GMAIL_VIEW, ON],
        [GMAIL_VIEW, { ...ON, hideInboxFooter: false }],
      ]
    );
  });

  it("stops pushing to a view whose next document is off Gmail", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));
    contract.shake(from(GMAIL_VIEW, { origin: "https://accounts.google.com" }));
    contract.page.push();

    expect(contract.sent).toHaveLength(1);
  });

  it("stops pushing to a view that is gone", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));
    contract.dropGmailView();
    // A later view given the same id has not shaken hands.
    contract.senders.register(GMAIL_VIEW, {
      role: "content-view",
      profileId: "a",
      tabId: "gmail",
    });
    contract.page.push();

    expect(contract.sent).toHaveLength(1);
  });

  it("tells the profile's page that shook hands to catch up, its main frame on Gmail's origin alone", () => {
    const contract = setup();

    contract.page.catchUp("a");

    expect(contract.sent).toStrictEqual([]);

    contract.shake(from(GMAIL_VIEW));
    contract.shake(from(CALENDAR_VIEW));
    contract.page.catchUp("b");
    contract.page.catchUp("a");

    expect(contract.sent.slice(1)).toStrictEqual([
      {
        to: GMAIL_VIEW,
        channel: GMAIL_CHANNELS.catchUp,
        message: undefined,
        options: { mainFrameOrigin: GMAIL_ORIGIN },
      },
    ]);
  });

  it("tells no page to catch up once it left Gmail or is gone", () => {
    const left = setup();

    left.shake(from(GMAIL_VIEW));
    left.shake(from(GMAIL_VIEW, { origin: "https://accounts.google.com" }));
    left.page.catchUp("a");

    expect(left.sent).toHaveLength(1);

    const gone = setup();

    gone.shake(from(GMAIL_VIEW));
    gone.dropGmailView();
    gone.page.catchUp("a");

    expect(gone.sent).toHaveLength(1);
  });

  it("logs a page's health by hook names once per change, and tells it on", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));
    contract.report(from(GMAIL_VIEW), HEALTH);
    contract.report(from(GMAIL_VIEW), { ...HEALTH, ms: 5 });
    contract.report(from(GMAIL_VIEW), {
      ...HEALTH,
      hooks: { ...HEALTH.hooks, footer: "matched", promo: "matched" },
    });

    expect(contract.logs).toStrictEqual([
      "Gmail's page in tab a/gmail (list): broken footer; absent promo, checked in 2 ms",
      "Gmail's page in tab a/gmail (list): every hook matched, checked in 2 ms",
    ]);
    expect(contract.reports.map((report) => report.hooks.footer)).toStrictEqual(
      ["broken", "matched"]
    );
  });

  it("refuses a report from a page that did not shake hands, from elsewhere, or malformed", () => {
    const contract = setup();

    contract.report(from(GMAIL_VIEW), HEALTH);
    contract.shake(from(GMAIL_VIEW));
    contract.report(from(CALENDAR_VIEW), HEALTH);
    contract.report(from(GMAIL_VIEW, { isMainFrame: false }), HEALTH);
    contract.report(from(GMAIL_VIEW), { ...HEALTH, address: "a@example.com" });
    contract.report(from(GMAIL_VIEW), "broken");

    expect(contract.reports).toStrictEqual([]);
    expect(
      contract.logs.filter((line) => line.startsWith("Refused"))
    ).toHaveLength(5);
    // Nothing the page sent reaches the log.
    expect(
      contract.logs.filter((line) => line.includes("malformed"))
    ).toStrictEqual([
      "Refused a malformed Gmail health report",
      "Refused a malformed Gmail health report",
    ]);
  });

  it("sends the profile's page that shook hands to a hash, its main frame on Gmail's origin alone", () => {
    const contract = setup();

    expect(contract.page.navigate("a", "#settings")).toBeFalsy();

    contract.shake(from(GMAIL_VIEW));
    contract.shake(from(CALENDAR_VIEW));

    expect(contract.page.navigate("b", "#settings")).toBeFalsy();
    expect(contract.page.navigate("a", "#search/%22x%22")).toBeTruthy();
    expect(contract.sent.slice(1)).toStrictEqual([
      {
        to: GMAIL_VIEW,
        channel: GMAIL_CHANNELS.navigate,
        message: "#search/%22x%22",
        options: { mainFrameOrigin: GMAIL_ORIGIN },
      },
    ]);
  });

  it("sends no page anything that is not a hash, nor a page that left Gmail or is gone", () => {
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));

    expect(contract.page.navigate("a", "settings")).toBeFalsy();
    expect(
      contract.page.navigate("a", `#${"a".repeat(GMAIL_HASH_MAX_LENGTH)}`)
    ).toBeFalsy();

    contract.shake(from(GMAIL_VIEW, { origin: "https://accounts.google.com" }));

    expect(contract.page.navigate("a", "#settings")).toBeFalsy();

    const gone = setup();

    gone.shake(from(GMAIL_VIEW));
    gone.dropGmailView();

    expect(gone.page.navigate("a", "#settings")).toBeFalsy();
    expect([contract.sent.length, gone.sent.length]).toStrictEqual([1, 1]);
  });

  it("says no page took it when the page's frame left Gmail without shaking hands again", () => {
    // As for sign-in, which has no preload to shake hands from.
    const contract = setup();

    contract.shake(from(GMAIL_VIEW));
    contract.leave(GMAIL_VIEW);

    expect(contract.page.navigate("a", "#settings")).toBeFalsy();
    expect(contract.sent).toHaveLength(1);
  });

  it.each([
    "中".repeat(SEARCH_QUERY_MAX_LENGTH),
    '"'.repeat(SEARCH_QUERY_MAX_LENGTH),
  ])(
    "sends the search for the longest query %#, however it encodes",
    (query) => {
      const contract = setup();

      contract.shake(from(GMAIL_VIEW));

      expect(contract.page.navigate("a", searchHash(query))).toBeTruthy();
      expect(contract.sent.at(-1)?.message).toBe(searchHash(query));
    }
  );

  it("sends each document that shakes hands the user styles as read then", async () => {
    const files = ["a { color: red }", ""];
    const contract = setup(() => Promise.resolve(files.shift() ?? ""));

    contract.shake(from(GMAIL_VIEW));
    await expect
      .poll(() => contract.sent.map(({ channel }) => channel))
      .toStrictEqual([GMAIL_CHANNELS.features, GMAIL_CHANNELS.userStyles]);

    contract.shake(from(GMAIL_VIEW));
    await expect.poll(() => contract.sent).toHaveLength(4);

    expect(
      contract.sent
        .filter(({ channel }) => channel === GMAIL_CHANNELS.userStyles)
        .map(({ message, options }) => ({ message, options }))
    ).toStrictEqual([
      {
        message: "a { color: red }",
        options: { mainFrameOrigin: GMAIL_ORIGIN },
      },
      { message: "", options: { mainFrameOrigin: GMAIL_ORIGIN } },
    ]);
  });

  it("sends no user styles to a page gone or off Gmail by the time they are read, nor any it could not read", async () => {
    const read = Promise.withResolvers<string>();
    const contract = setup(() => read.promise);

    contract.shake(from(GMAIL_VIEW));
    contract.dropGmailView();
    read.resolve("a {}");
    await Promise.resolve();
    await Promise.resolve();

    expect(contract.sent).toHaveLength(1);

    const failing = setup(() => Promise.reject(new Error("EACCES /secret")));

    failing.shake(from(GMAIL_VIEW));
    await expect
      .poll(() => failing.logs)
      .toStrictEqual(["Gmail's user styles were not read"]);
    expect(failing.sent).toHaveLength(1);
  });
});
