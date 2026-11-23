import { net, session } from "electron";

import type { BrowsingDataType } from "#core/browsing-data.ts";
import type { FeedResponse } from "#core/feed.ts";
import type { ActionResponse } from "#core/mail-actions.ts";
import type { PermissionAsk } from "#core/permissions.ts";

export interface Sessions {
  /** Every kind of data the partition's session holds, cache included. */
  clear: (partition: string) => Promise<void>;
  /** Only these kinds of data the partition's session holds. */
  clearData: (
    partition: string,
    dataTypes: readonly BrowsingDataType[]
  ) => Promise<void>;
  /**
   * Answers every permission request and check in the partition's session with
   * `allows`, in place of Electron's default of granting all, and refuses
   * screen capture. Once per session; later calls change nothing.
   */
  guard: (partition: string, allows: (ask: PermissionAsk) => boolean) => void;
  /**
   * GETs `url` in the partition's session, with its cookies and never from the
   * cache. A redirect is answered, not followed. Rejects on a network error,
   * a body over 1 MB, or once `signal` aborts.
   */
  get: (
    partition: string,
    url: string,
    signal: AbortSignal
  ) => Promise<FeedResponse>;
  /**
   * POSTs the urlencoded `body` to `url` as `get` asks, and answers with the
   * `Set-Cookie` headers too, which the session also keeps.
   */
  post: (
    partition: string,
    url: string,
    body: string,
    signal: AbortSignal
  ) => Promise<ActionResponse>;
}

// A feed of 20 entries is a few kilobytes.
const MAX_BODY_BYTES = 1024 * 1024;

// `session.fetch` rejects a redirect it was told not to follow with the same
// kind of error as a network failure, so the request is made by hand.
const send = (
  partition: string,
  url: string,
  body: string | undefined,
  signal: AbortSignal
) => {
  const { promise, resolve, reject } = Promise.withResolvers<ActionResponse>();
  const request = net.request({
    url,
    method: body === undefined ? "GET" : "POST",
    session: session.fromPartition(partition),
    redirect: "manual",
    useSessionCookies: true,
    cache: "no-store",
  });
  const abort = () => {
    request.abort();
    reject(signal.reason);
  };

  if (signal.aborted) {
    abort();

    return promise;
  }

  signal.addEventListener("abort", abort, { once: true });

  const settle = () => {
    signal.removeEventListener("abort", abort);
  };

  request.on("redirect", () => {
    settle();
    request.abort();
    resolve({ kind: "redirect" });
  });
  request.on("error", (error) => {
    settle();
    reject(error);
  });
  request.on("response", (response) => {
    const chunks: Buffer[] = [];
    let size = 0;

    response.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        settle();
        request.abort();
        reject(new Error(`the body is over ${MAX_BODY_BYTES} bytes`));

        return;
      }

      chunks.push(chunk);
    });
    response.on("error", (error: Error) => {
      settle();
      reject(error);
    });
    response.on("end", () => {
      settle();
      const setCookies = response.headers["set-cookie"] ?? [];

      resolve({
        kind: "response",
        status: response.statusCode,
        body: Buffer.concat(chunks).toString("utf-8"),
        setCookies: Array.isArray(setCookies) ? setCookies : [setCookies],
      });
    });
  });

  if (body !== undefined) {
    request.setHeader(
      "Content-Type",
      "application/x-www-form-urlencoded;charset=utf-8"
    );
    request.write(body);
  }

  request.end();

  return promise;
};

export const createSessions = (): Sessions => {
  const guarded = new WeakSet<Electron.Session>();

  return {
    get: (partition, url, signal) => send(partition, url, undefined, signal),
    post: send,
    clear: (partition) => session.fromPartition(partition).clearData(),
    clearData: (partition, dataTypes) =>
      session.fromPartition(partition).clearData({ dataTypes: [...dataTypes] }),
    guard: (partition, allows) => {
      const guarding = session.fromPartition(partition);

      if (guarded.has(guarding)) {
        return;
      }

      guarded.add(guarding);
      guarding.setPermissionRequestHandler(
        (webContents, permission, answer, details) => {
          const media: Partial<Electron.MediaAccessPermissionRequest> =
            "mediaTypes" in details ? details : {};

          answer(
            allows({
              permission,
              // For media, the origin the camera or microphone is asked for.
              requestingUrl: media.securityOrigin ?? details.requestingUrl,
              topLevelUrl: webContents.getURL(),
              ...(media.mediaTypes ? { mediaTypes: media.mediaTypes } : {}),
            })
          );
        }
      );
      guarding.setPermissionCheckHandler(
        (_webContents, permission, requestingOrigin, details) =>
          allows({
            permission,
            requestingUrl: requestingOrigin,
            topLevelUrl: details.embeddingOrigin ?? requestingOrigin,
            ...(details.mediaType ? { mediaTypes: [details.mediaType] } : {}),
          })
      );
      // Sharing a screen needs a picker Meru does not have yet.
      guarding.setDisplayMediaRequestHandler((_request, answer) => {
        answer(null);
      });
    },
  };
};
