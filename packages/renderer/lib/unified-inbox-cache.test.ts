import { describe, expect, test } from "bun:test";
import type { GmailInboxMessage } from "@meru/shared/gmail";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import {
  mergeFetchedUnifiedInbox,
  mergeUnifiedInboxPush,
  type UnifiedInbox,
  unifiedInboxCacheOptions,
  unifiedInboxQueryKey,
} from "./unified-inbox-cache";

function message(id: string): GmailInboxMessage {
  return {
    id,
    subject: `Subject ${id}`,
    summary: `Summary ${id}`,
    author: { name: "Sender", email: "sender@example.com" },
    contributors: [],
    receivedAt: 1_700_000_000_000,
  };
}

/** The route's query, with the invoke replaced by a fetch the test drives. */
function unifiedInboxOptions(queryClient: QueryClient, fetch: () => Promise<UnifiedInbox>) {
  return queryOptions({
    ...unifiedInboxCacheOptions,
    queryFn: async () => mergeFetchedUnifiedInbox(queryClient, await fetch()),
  });
}

describe("mergeUnifiedInboxPush", () => {
  test("drops a push that arrives with no entry in the cache", () => {
    const queryClient = new QueryClient();

    mergeUnifiedInboxPush(queryClient, "account-1", [message("a")]);

    expect(queryClient.getQueryData(unifiedInboxQueryKey)).toBeUndefined();
    expect(queryClient.getQueryCache().find({ queryKey: unifiedInboxQueryKey })).toBeUndefined();
  });

  test("merges a push into an entry that holds a list, leaving the other accounts alone", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData<UnifiedInbox>(unifiedInboxQueryKey, {
      "account-1": [message("a")],
      "account-2": [message("b")],
    });

    mergeUnifiedInboxPush(queryClient, "account-1", [message("c")]);

    expect(queryClient.getQueryData<UnifiedInbox>(unifiedInboxQueryKey)).toEqual({
      "account-1": [message("c")],
      "account-2": [message("b")],
    });
  });

  test("drops a push into an entry whose fetch failed", async () => {
    const queryClient = new QueryClient();

    await queryClient
      .fetchQuery(
        unifiedInboxOptions(queryClient, () => Promise.reject(new Error("invoke failed"))),
      )
      .catch(() => {});

    const failed = queryClient.getQueryCache().find({ queryKey: unifiedInboxQueryKey });

    expect(failed?.state.status).toBe("error");

    mergeUnifiedInboxPush(queryClient, "account-1", [message("a")]);

    expect(queryClient.getQueryData(unifiedInboxQueryKey)).toBeUndefined();
  });
});

describe("mergeFetchedUnifiedInbox", () => {
  test("keeps a push that landed while the fetch was in flight", async () => {
    const queryClient = new QueryClient();

    let resolveFetch: (unifiedInbox: UnifiedInbox) => void = () => {};

    const fetching = queryClient.fetchQuery(
      unifiedInboxOptions(
        queryClient,
        () =>
          new Promise<UnifiedInbox>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    mergeUnifiedInboxPush(queryClient, "account-1", [message("pushed")]);

    resolveFetch({ "account-1": [message("fetched")], "account-2": [message("b")] });

    await fetching;

    expect(queryClient.getQueryData<UnifiedInbox>(unifiedInboxQueryKey)).toEqual({
      "account-1": [message("pushed")],
      "account-2": [message("b")],
    });
  });
});

describe("unifiedInboxCacheOptions", () => {
  test("serves a remount from the warm entry without fetching again", async () => {
    const queryClient = new QueryClient();

    let fetches = 0;

    const fetch = () => {
      fetches += 1;

      return Promise.resolve<UnifiedInbox>({ "account-1": [message("a")] });
    };

    await queryClient.fetchQuery(unifiedInboxOptions(queryClient, fetch));

    mergeUnifiedInboxPush(queryClient, "account-1", [message("pushed")]);

    const remounted = await queryClient.fetchQuery(unifiedInboxOptions(queryClient, fetch));

    expect(fetches).toBe(1);
    expect(remounted).toEqual({ "account-1": [message("pushed")] });
  });
});
