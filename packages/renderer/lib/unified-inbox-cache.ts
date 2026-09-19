import type { GmailInboxMessage } from "@meru/shared/gmail";
import type { QueryClient } from "@tanstack/react-query";

export type UnifiedInbox = Record<string, GmailInboxMessage[]>;

export const unifiedInboxQueryKey = ["unifiedInbox"] as const;

/**
 * The renderer's cache is the only copy of the inbox lists, and nothing
 * fetches it: every account sends its list on its first feed fetch, where the
 * missing baseline counts as a change, and again whenever the feed changes.
 * So the query starts empty and fills from the pushes, and an account that has
 * not sent one yet contributes nothing rather than holding the page up.
 *
 * Keeping it for the window's lifetime costs about 50 KB per account at the
 * feed's hundred-entry cap. Fetching it on open instead cost an invoke that
 * waited on the slowest account, and a race between that invoke's result and
 * the pushes that landed while it was in flight.
 */
const unifiedInboxCacheLifetime = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

export const unifiedInboxCacheOptions = {
  queryKey: unifiedInboxQueryKey,
  initialData: (): UnifiedInbox => ({}),
  ...unifiedInboxCacheLifetime,
};

/**
 * A push that arrives before anything has mounted the unified inbox builds the
 * entry itself, and `setQueryData` builds it from the client's defaults rather
 * than from the options an observer would later bring. Without these it would
 * get the default five-minute `gcTime` and be collected before anyone opened
 * the route, losing every account that had not pushed since.
 */
export function registerUnifiedInboxCacheDefaults(queryClient: QueryClient) {
  queryClient.setQueryDefaults(unifiedInboxQueryKey, unifiedInboxCacheLifetime);
}

export function mergeUnifiedInboxPush(
  queryClient: QueryClient,
  accountId: string,
  messages: GmailInboxMessage[],
) {
  queryClient.setQueryData<UnifiedInbox>(unifiedInboxQueryKey, (unifiedInbox) => ({
    ...unifiedInbox,
    [accountId]: messages,
  }));
}
