import { describe, expect, test } from "bun:test";
import type { GmailInboxMessage } from "@meru/shared/gmail";
import { QueryClient, QueryObserver, queryOptions } from "@tanstack/react-query";
import {
  mergeUnifiedInboxPush,
  registerUnifiedInboxCacheDefaults,
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

function createQueryClient() {
  const queryClient = new QueryClient();

  registerUnifiedInboxCacheDefaults(queryClient);

  return queryClient;
}

describe("mergeUnifiedInboxPush", () => {
  test("builds the entry from a push that arrives before anything reads it", () => {
    const queryClient = createQueryClient();

    mergeUnifiedInboxPush(queryClient, "account-1", [message("a")]);

    expect(queryClient.getQueryData<UnifiedInbox>(unifiedInboxQueryKey)).toEqual({
      "account-1": [message("a")],
    });
  });

  test("keeps an entry it built alive for the window's lifetime", () => {
    const queryClient = createQueryClient();

    // Asserted on the options `setQueryData` builds an entry from rather than
    // on the built entry, because query-core reads `gcTime` as infinite
    // wherever there is no `window`, which is every run of this suite and no
    // run of the renderer. In the renderer the fallback is five minutes, and
    // an entry built by a push before anything observed it would be collected
    // before the route was ever opened.
    expect(queryClient.defaultQueryOptions({ queryKey: unifiedInboxQueryKey }).gcTime).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  test("replaces one account's list and leaves the others alone", () => {
    const queryClient = createQueryClient();

    mergeUnifiedInboxPush(queryClient, "account-1", [message("a")]);
    mergeUnifiedInboxPush(queryClient, "account-2", [message("b")]);
    mergeUnifiedInboxPush(queryClient, "account-1", [message("c")]);

    expect(queryClient.getQueryData<UnifiedInbox>(unifiedInboxQueryKey)).toEqual({
      "account-1": [message("c")],
      "account-2": [message("b")],
    });
  });
});

describe("unifiedInboxCacheOptions", () => {
  test("never fetches, and reads an empty map until the first push", () => {
    const queryClient = createQueryClient();

    let fetches = 0;

    const observer = new QueryObserver(
      queryClient,
      queryOptions({
        ...unifiedInboxCacheOptions,
        queryFn: () => {
          fetches += 1;

          return {} as UnifiedInbox;
        },
      }),
    );

    const unsubscribe = observer.subscribe(() => {});

    expect(observer.getCurrentResult().data).toEqual({});
    expect(observer.getCurrentResult().isPending).toBe(false);

    mergeUnifiedInboxPush(queryClient, "account-1", [message("a")]);

    expect(observer.getCurrentResult().data).toEqual({ "account-1": [message("a")] });
    expect(fetches).toBe(0);

    unsubscribe();
  });
});
