import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createEntitlementApi } from "./entitlement-api.ts";

const servers: Server[] = [];

/** A server that answers every request with `status` and `body`, and keeps the bodies it was sent. */
const serve = async (status: number, body: string) => {
  const received: unknown[] = [];
  const server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    request.on("end", () => {
      received.push(JSON.parse(text));
      response.writeHead(status, { "content-type": "application/json" });
      response.end(body);
    });
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The server has no port");
  }
  return {
    api: createEntitlementApi({
      fetch,
      url: `http://127.0.0.1:${address.port}/entitlement/issue`,
    }),
    received,
  };
};

const request = { deviceId: "device-1", licenseKey: "KEY-1" };

describe(createEntitlementApi, () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (server) => {
        server.close();
        await once(server, "close");
      })
    );
  });

  it("posts the license key and device id and returns the token", async () => {
    const { api, received } = await serve(200, '{"token":"a.b.c"}');
    await expect(api.issue(request)).resolves.toStrictEqual({
      ok: true,
      value: { token: "a.b.c" },
    });
    expect(received).toStrictEqual([request]);
  });

  it("passes the status and body of a refusal on", async () => {
    const { api } = await serve(
      403,
      '{"error":{"reason":"unknownLicenseKey"}}'
    );
    await expect(api.issue(request)).resolves.toStrictEqual({
      error: { kind: "rejected", reason: "unknownLicenseKey" },
      ok: false,
    });
  });

  it("is offline when nothing answers", async () => {
    const api = createEntitlementApi({ fetch, url: "http://127.0.0.1:1/" });
    await expect(api.issue(request)).resolves.toMatchObject({
      error: { kind: "offline" },
      ok: false,
    });
  });
});
