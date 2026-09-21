import type { GmailInboxMessage } from "@meru/shared/gmail";
import type { AccountConfig, AccountInstance } from "@meru/shared/schemas";
import type { UnifiedInbox } from "./unified-inbox-cache";

export type InboxMessage = GmailInboxMessage & {
  account: Pick<AccountConfig, "id" | "label" | "color">;
};

/**
 * Which accounts the unified inbox draws from. The cache holds more than that:
 * an account on Hibernate Gmail pushes its list whether or not it is in the
 * unified inbox, because the same cache is where its own inbox is read from.
 */
export function getUnifiedInboxAccountIds(accounts: Pick<AccountInstance, "config">[]) {
  return accounts
    .filter((account) => account.config.gmail.unifiedInbox)
    .map((account) => account.config.id);
}

/** Every unread message of the named accounts, newest first. */
export function selectInboxMessages(
  accounts: Pick<AccountInstance, "config">[],
  unifiedInbox: UnifiedInbox,
  accountIds: AccountConfig["id"][],
): InboxMessage[] {
  const selectedAccountIds = new Set(accountIds);

  return accounts
    .filter((account) => selectedAccountIds.has(account.config.id))
    .flatMap((account) =>
      (unifiedInbox[account.config.id] ?? []).map((message) => ({
        account: {
          id: account.config.id,
          label: account.config.label,
          color: account.config.color,
        },
        ...message,
      })),
    )
    .sort((a, b) => (b.receivedAt > a.receivedAt ? 1 : -1));
}
