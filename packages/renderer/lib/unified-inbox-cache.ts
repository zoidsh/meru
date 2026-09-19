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
 * Merges one account's list into an entry that either already holds a list or
 * has a fetch in flight to fill it, and is dropped otherwise.
 *
 * A push carries a single account, so an entry left holding only what a push
 * put there is a partial map, and an infinite `staleTime` has the next mount
 * render that map and never fetch the rest. An entry with no data and no fetch
 * running — one whose fetch failed, or one that never had a reason to exist —
 * would be left exactly that way, so a push has nothing to merge into. An
 * in-flight fetch is the case worth allowing: `mergeFetchedUnifiedInbox`
 * carries the push over the resolve, and dropping it here would leave the
 * fetched list to overwrite mail that is newer than it is.
 *
 * One case stays imperfect, and is left alone: an invoke that rejects after a
 * push has written leaves the partial map behind. It takes broken IPC to get
 * there, since main swallows per-account failures and returns `{}` when Pro or
 * the setting is off, so it is not worth a rollback path.
 */
export function mergeUnifiedInboxPush(
  queryClient: QueryClient,
  accountId: string,
  messages: GmailInboxMessage[],
) {
  const entry = queryClient.getQueryCache().find({ queryKey: unifiedInboxQueryKey });

  if (!entry || (entry.state.data === undefined && entry.state.fetchStatus !== "fetching")) {
    return;
  }

  queryClient.setQueryData<UnifiedInbox>(unifiedInboxQueryKey, (unifiedInbox) => ({
    ...unifiedInbox,
    [accountId]: messages,
  }));
}
