import type { GmailInboxMessage } from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import type { QueryClient } from "@tanstack/react-query";

export type UnifiedInbox = Record<string, GmailInboxMessage[]>;

export const unifiedInboxQueryKey = ["unifiedInbox"] as const;

export const unifiedInboxCacheOptions = {
  queryKey: unifiedInboxQueryKey,
  // The per-account pushes keep the entry current, so it is never refetched.
  staleTime: Number.POSITIVE_INFINITY,
  // New mail is exactly when the unified inbox gets opened, so the list stays
  // warm for a few minutes past the route closing, and the pushes that arrive
  // in between are not wasted.
  gcTime: ms("5m"),
};

/**
 * A resolved fetch overwrites whatever `setQueryData` wrote while it was in
 * flight, and an account on the retry ladder can hold the invoke for ten
 * seconds. An infinite `staleTime` leaves the fetch running only against an
 * entry with no data of its own, so anything in the cache by the time it
 * resolves is a push that landed during it, and is the newer of the two.
 */
export function mergeFetchedUnifiedInbox(
  queryClient: QueryClient,
  fetched: UnifiedInbox,
): UnifiedInbox {
  return { ...fetched, ...queryClient.getQueryData<UnifiedInbox>(unifiedInboxQueryKey) };
}

/**
 * Merges one account's list into an entry that is already there, never
 * creating one and never filling one in. A push carries a single account, so
 * an entry conjured out of one would be a partial map, and an infinite
 * `staleTime` would have the next mount render it and never fetch the rest. An
 * entry whose fetch failed holds no data and counts as absent for the same
 * reason, rather than becoming a partial success that nothing retries.
 */
export function mergeUnifiedInboxPush(
  queryClient: QueryClient,
  accountId: string,
  messages: GmailInboxMessage[],
) {
  if (
    queryClient.getQueryCache().find({ queryKey: unifiedInboxQueryKey })?.state.data === undefined
  ) {
    return;
  }

  queryClient.setQueryData<UnifiedInbox>(unifiedInboxQueryKey, (unifiedInbox) => ({
    ...unifiedInbox,
    [accountId]: messages,
  }));
}
