import { once } from "node:events";
import { createServer } from "node:http";

import type { ElectronApplication } from "@playwright/test";
import { z } from "zod";

import { SESSION_BODY_CAP } from "../app/core/ports.ts";
import { E2E_FETCH } from "../app/main/shell/e2e.ts";
import { expect, test } from "./app.ts";

const responseSchema = z.union([
  z.object({
    kind: z.literal("answered"),
    status: z.number(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("redirected"),
    location: z.string(),
    status: z.number(),
  }),
  z.object({ kind: z.literal("tooLarge") }),
  z.object({ rejected: z.string() }),
]);

/** Reads `url` through a profile's session in main, as the inbox does, with what it answered or the rejection's message. */
const fetchIn = async (
  app: ElectronApplication,
  url: string,
  timeout: number
) =>
  responseSchema.parse(
    JSON.parse(
      await app.evaluate(
        async (_electron, [name, address, wait]) => {
          const read: unknown = Reflect.get(globalThis, name);
          if (typeof read !== "function") {
            throw new TypeError(`Main exposes nothing under ${name}`);
          }
          try {
            const answer: unknown = await Reflect.apply(read, undefined, [
              "persist:e2e",
              address,
              wait,
            ]);
            return String(answer);
          } catch (error) {
            return JSON.stringify({ rejected: String(error) });
          }
        },
        [E2E_FETCH, url, timeout] as const
      )
    )
  );

test("reads through a session over the real network stack: a body up to the cap, none past it, a redirect reported and not followed, and a server that never answers timed out", async ({
  launch,
}) => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    if (path === "/exact") {
      response.writeHead(200).end("a".repeat(SESSION_BODY_CAP));
    } else if (path === "/over") {
      response.writeHead(200).end("a".repeat(SESSION_BODY_CAP + 1));
    } else if (path === "/redirect") {
      response.writeHead(302, { location: "/elsewhere" }).end();
    } else if (path === "/hang") {
      response.writeHead(200);
      response.write("<?xml");
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The loopback server has no port");
  }
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const { app } = await launch();
    const exact = await fetchIn(app, `${base}/exact`, 5000);
    expect([
      "kind" in exact ? exact.kind : exact.rejected,
      "text" in exact ? exact.text.length : 0,
      await fetchIn(app, `${base}/over`, 5000),
      await fetchIn(app, `${base}/redirect`, 5000),
      await fetchIn(app, `${base}/hang`, 500),
      requests,
    ]).toStrictEqual([
      "answered",
      SESSION_BODY_CAP,
      { kind: "tooLarge" },
      { kind: "redirected", location: `${base}/elsewhere`, status: 302 },
      { rejected: "Error: No answer within 500 ms" },
      ["/exact", "/over", "/redirect", "/hang"],
    ]);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
