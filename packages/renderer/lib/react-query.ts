import type { GmailInboxMessage } from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import { ipc } from "@meru/shared/renderer/ipc";
import type { Config } from "@meru/shared/types";
import { QueryClient, queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { platform } from "./utils";

export const queryClient = new QueryClient();

ipc.renderer.on("config.configChanged", (_event, config) => {
  queryClient.setQueryData(["config"], config);
});

const configOptions = queryOptions({
  queryKey: ["config"],
  queryFn: () => ipc.main.invoke("config.getConfig"),
  staleTime: Number.POSITIVE_INFINITY,
});

export function useConfig() {
  const { data } = useQuery(configOptions);

  return {
    config: data,
  };
}

ipc.renderer.on("bookmarks.changed", (_event, bookmarks) => {
  queryClient.setQueryData(["bookmarks"], bookmarks);
});

/**
 * The bookmarks popup is a view of its own, so it fetches the list on mount and
 * the main process pushes it again whenever the saved bookmarks change
 * underneath it.
 */
export function useBookmarks() {
  const { data } = useQuery(
    queryOptions({
      queryKey: ["bookmarks"],
      queryFn: () => ipc.main.invoke("bookmarks.getBookmarks"),
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );

  return { bookmarks: data };
}

export const unifiedInboxOptions = queryOptions({
  queryKey: ["unifiedInbox"],
  queryFn: async (): Promise<Record<string, GmailInboxMessage[]>> => {
    const fetched = await ipc.main.invoke("gmail.getUnifiedInbox");

    // A resolved fetch overwrites whatever `setQueryData` wrote while it was in
    // flight, and an account on the retry ladder can hold it for ten seconds.
    // An infinite `staleTime` leaves this running only against an entry with no
    // data — a fresh one, or one whose last fetch failed — so anything in the
    // cache by now is a push that landed during the fetch, and it is the newer
    // of the two.
    return {
      ...fetched,
      ...queryClient.getQueryData<Record<string, GmailInboxMessage[]>>(["unifiedInbox"]),
    };
  },
  // The per-account pushes below keep the entry current, so it is never refetched.
  staleTime: Number.POSITIVE_INFINITY,
  // New mail is exactly when the unified inbox gets opened, so the list stays
  // warm for a few minutes past the route closing, and the pushes that arrive
  // in between are not wasted.
  gcTime: ms("5m"),
});

ipc.renderer.on("gmail.inboxChanged", (_event, accountId, messages) => {
  // Merged into a list that is already there, never creating one and never
  // filling one in. A push carries a single account, and an infinite
  // `staleTime` means a mount that found that partial map would render it and
  // never fetch the rest. An entry whose fetch failed holds no data and counts
  // as absent here for the same reason.
  if (
    queryClient.getQueryCache().find({ queryKey: unifiedInboxOptions.queryKey })?.state.data ===
    undefined
  ) {
    return;
  }

  queryClient.setQueryData(unifiedInboxOptions.queryKey, (unifiedInbox) => ({
    ...unifiedInbox,
    [accountId]: messages,
  }));
});

export function useIsBelowMinimumMacOSVersion() {
  const { data } = useQuery(
    queryOptions({
      queryKey: ["updates", "isBelowMinimumMacOSVersion"],
      queryFn: () => ipc.main.invoke("updates.isBelowMinimumMacOSVersion"),
      enabled: platform.isMacOS,
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );

  return data ?? false;
}

export function useConfigMutation({
  onSuccess,
}: {
  onSuccess?: () => void;
} = {}) {
  return useMutation({
    mutationFn: (config: Partial<Config>) => ipc.main.invoke("config.setConfig", config),
    onSuccess,
  });
}
