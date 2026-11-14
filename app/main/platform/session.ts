import { net, session } from "electron";

import { SESSION_BODY_CAP } from "../../core/ports.ts";
import type { SessionPort, SessionResponse } from "../../core/ports.ts";

// net.fetch refuses a manual redirect outright ("Redirect was cancelled") on Electron 45, so the request is a ClientRequest, which reports the redirect and lets it be dropped.
const fetchText = async (
  partition: string,
  url: string,
  timeout: number
): Promise<SessionResponse> => {
  const { promise, reject, resolve } = Promise.withResolvers<SessionResponse>();
  const request = net.request({
    redirect: "manual",
    session: session.fromPartition(partition),
    url,
    useSessionCookies: true,
  });
  let settled = false;
  const settle = (finish: () => void) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      finish();
    }
  };
  const timer = setTimeout(() => {
    settle(() => {
      reject(new Error(`No answer within ${timeout} ms`));
    });
    request.abort();
  }, timeout);
  request.on("redirect", (status, _method, location) => {
    settle(() => {
      resolve({ kind: "redirected", location, status });
    });
    request.abort();
  });
  request.on("response", (response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.length;
      if (size > SESSION_BODY_CAP) {
        settle(() => {
          resolve({ kind: "tooLarge" });
        });
        request.abort();
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => {
      settle(() => {
        resolve({
          kind: "answered",
          status: response.statusCode,
          text: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });
    response.on("error", (error: Error) => {
      settle(() => {
        reject(error);
      });
    });
  });
  request.on("error", (error) => {
    settle(() => {
      reject(error);
    });
  });
  request.end();
  return await promise;
};

export const createSessions = (): SessionPort => ({
  clear: async (partition) => {
    const found = session.fromPartition(partition);
    await found.clearStorageData();
    await found.clearCache();
  },
  fetchText,
});
