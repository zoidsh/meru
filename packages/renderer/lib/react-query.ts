import { ipc } from "@meru/shared/renderer/ipc";
import type { Config } from "@meru/shared/types";
import { QueryClient, queryOptions, useMutation, useQuery } from "@tanstack/react-query";

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
