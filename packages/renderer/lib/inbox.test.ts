import { describe, expect, test } from "bun:test";
import type { GmailInboxMessage } from "@meru/shared/gmail";
import type { AccountConfig } from "@meru/shared/schemas";
import { getUnifiedInboxAccountIds, selectInboxMessages } from "./inbox";

function account(
  id: string,
  gmail: Partial<AccountConfig["gmail"]> = {},
): { config: AccountConfig } {
  return {
    config: {
      id,
      label: `Account ${id}`,
      color: null,
      selected: false,
      notifications: true,
      gmail: {
        unreadBadge: true,
        unifiedInbox: true,
        delegatedAccountId: null,
        ...gmail,
      },
      workspaceApps: { savedTabs: [], bookmarks: [] },
    },
  };
}

function message(id: string, receivedAt: number): GmailInboxMessage {
  return {
    id,
    subject: `Subject ${id}`,
    summary: `Summary ${id}`,
    author: { name: "Sender", email: "sender@example.com" },
    contributors: [],
    receivedAt,
  };
}

describe("getUnifiedInboxAccountIds", () => {
  test("names the accounts that opted in", () => {
    expect(
      getUnifiedInboxAccountIds([
        account("a"),
        account("b", { unifiedInbox: false }),
        account("c"),
      ]),
    ).toEqual(["a", "c"]);
  });

  test("leaves out a Lite mode account that is not in the unified inbox", () => {
    expect(
      getUnifiedInboxAccountIds([account("a", { unifiedInbox: false, liteMode: "startup" })]),
    ).toEqual([]);
  });
});

describe("selectInboxMessages", () => {
  const accounts = [account("a"), account("b")];

  const unifiedInbox = {
    a: [message("a1", 1_700_000_000_000), message("a2", 1_700_000_002_000)],
    b: [message("b1", 1_700_000_001_000)],
  };

  test("carries each message's account alongside it, newest first", () => {
    expect(
      selectInboxMessages(accounts, unifiedInbox, ["a", "b"]).map((message) => [
        message.id,
        message.account.label,
      ]),
    ).toEqual([
      ["a2", "Account a"],
      ["b1", "Account b"],
      ["a1", "Account a"],
    ]);
  });

  test("takes only the accounts asked for", () => {
    expect(selectInboxMessages(accounts, unifiedInbox, ["a"]).map(({ id }) => id)).toEqual([
      "a2",
      "a1",
    ]);
  });

  test("answers empty for an account that has pushed nothing yet", () => {
    expect(selectInboxMessages(accounts, {}, ["a"])).toEqual([]);
  });

  test("ignores an account id the store does not know", () => {
    expect(selectInboxMessages(accounts, unifiedInbox, ["c"])).toEqual([]);
  });
});
