import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { issueRequestSchema } from "../packages/app/shared/entitlement/api.ts";
import { mintToken } from "../scripts/entitlement/sign.ts";

const DAY = 86_400;

/** What the stub answers a license key with: a token, or a refusal. */
export type StubAnswer =
  | { readonly kind: "trial"; readonly days: number }
  | { readonly kind: "pro" | "team"; readonly deviceLimit: number }
  | { readonly kind: "disabled"; readonly reason: string }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "serverError" };

export interface Stub {
  readonly url: string;
  /** Every request's body that parsed, in order. */
  readonly requests: { licenseKey: string | null; deviceId: string }[];
  /** Answers `licenseKey` from now on; null is a device with no license key. */
  readonly answer: (licenseKey: string | null, answer: StubAnswer) => void;
  /** Holds every answer until `release`, so what the app shows before one arrives can be seen. */
  readonly hold: () => void;
  readonly release: () => void;
  readonly stop: () => Promise<void>;
}

const readBody = async (request: IncomingMessage) => {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
  }
  return text;
};

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

/** Signs with the development key, so only a run from the repository accepts its tokens. */
const tokenFor = (
  answer: Exclude<StubAnswer, { kind: "rejected" | "serverError" }>,
  deviceId: string,
  ttl: number
) => {
  const now = Math.floor(Date.now() / 1000);
  const base = { sub: deviceId, ttl };
  if (answer.kind === "trial") {
    return mintToken({
      ...base,
      deviceLimit: 1,
      endsAt: now + answer.days * DAY,
      plan: "trial",
      status: "active",
    });
  }
  if (answer.kind === "disabled") {
    return mintToken({
      ...base,
      deviceLimit: 1,
      plan: "pro",
      reason: answer.reason,
      status: "disabled",
    });
  }
  return mintToken({
    ...base,
    deviceLimit: answer.deviceLimit,
    plan: answer.kind,
    status: "active",
  });
};

/** A loopback stand-in for the entitlement API, answering per license key with tokens signed by the development key. */
export const startStub = async ({
  answers = [],
  ttl = 3 * 3600,
}: {
  readonly answers?: readonly (readonly [string | null, StubAnswer])[];
  readonly ttl?: number;
} = {}): Promise<Stub> => {
  const table = new Map<string | null, StubAnswer>([
    [null, { days: 14, kind: "trial" }],
    ...answers,
  ]);
  const requests: Stub["requests"] = [];
  const gate = new EventTarget();
  let holding = false;
  const server = createServer((request, response) => {
    const handle = async () => {
      const text = await readBody(request);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      const parsed = issueRequestSchema.safeParse(json);
      if (!parsed.success) {
        send(response, 400, { error: { reason: "malformedRequest" } });
        return;
      }
      requests.push(parsed.data);
      if (holding) {
        await once(gate, "release");
      }
      const answer = table.get(parsed.data.licenseKey);
      if (answer === undefined) {
        send(response, 403, { error: { reason: "unknownLicenseKey" } });
      } else if (answer.kind === "rejected") {
        send(response, 403, { error: { reason: answer.reason } });
      } else if (answer.kind === "serverError") {
        send(response, 500, { error: { reason: "serverError" } });
      } else {
        send(response, 200, {
          token: tokenFor(answer, parsed.data.deviceId, ttl),
        });
      }
    };
    void handle();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The entitlement stub has no port");
  }
  return {
    answer: (licenseKey, answer) => {
      table.set(licenseKey, answer);
    },
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      gate.dispatchEvent(new Event("release"));
    },
    requests,
    stop: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
    url: `http://127.0.0.1:${address.port}/entitlement/issue`,
  };
};

// Run directly, it serves a trial to a device with no license key and Pro to PRO-KEY until stopped.
if (import.meta.main) {
  const stub = await startStub({
    answers: [["PRO-KEY", { deviceLimit: 3, kind: "pro" }]],
  });
  console.log(`MERU_ENTITLEMENT_URL=${stub.url}`);
}
