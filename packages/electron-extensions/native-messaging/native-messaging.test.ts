import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { EXTENSION_BRIDGE_ORIGIN } from "../bridge/protocol";
import { NATIVE_MESSAGING_PATHS, type NativeMessagingFrame } from "./bridge-protocol";
import { NativeMessageDecoder } from "./framing";
import { getHostManifestSearchPaths } from "./host-manifest";
import { NativeMessaging } from "./native-messaging";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const BRIDGE_TOKEN = "bridge-token";

const HOST_NAME = "com.meru.test";

/** Echoes every message back, so a round trip proves the whole path. */
const HOST_SOURCE = `
let buffered = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  while (buffered.byteLength >= 4) {
    const length = buffered.readUInt32LE(0);
    if (buffered.byteLength < 4 + length) return;
    const body = JSON.parse(buffered.subarray(4, 4 + length).toString("utf8"));
    buffered = buffered.subarray(4 + length);
    const reply = Buffer.from(JSON.stringify({ echo: body, origin: process.argv[2] }), "utf8");
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(reply.byteLength, 0);
    process.stdout.write(Buffer.concat([prefix, reply]));
  }
});
`;

let workDir: string;

let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

let session: Session;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "native-messaging-"));

  const hostScriptPath = path.join(workDir, "host.js");

  await writeFile(hostScriptPath, HOST_SOURCE);

  await writeFile(
    path.join(workDir, "host"),
    `#!/bin/sh\nexec "${process.execPath}" "${hostScriptPath}" "$@"\n`,
  );

  await chmod(path.join(workDir, "host"), 0o755);

  requestHandler = undefined;

  session = {
    protocol: {
      handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        requestHandler = handler;
      },
      unhandle: () => {
        requestHandler = undefined;
      },
    },
  } as unknown as Session;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeHostManifest(allowedExtensionId = EXTENSION_ID) {
  const manifestPath = getHostManifestSearchPaths(HOST_NAME, { homeDir: workDir })[0] as string;

  await mkdir(path.dirname(manifestPath), { recursive: true });

  await writeFile(
    manifestPath,
    JSON.stringify({
      name: HOST_NAME,
      path: path.join(workDir, "host"),
      type: "stdio",
      allowed_origins: [`chrome-extension://${allowedExtensionId}/`],
    }),
  );
}

function createRequest(pathName: string, body: Record<string, unknown>) {
  return new Request(`${EXTENSION_BRIDGE_ORIGIN}${pathName}`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as GlobalRequest;
}

function connect(portId = "port-1") {
  return requestHandler?.(
    createRequest(NATIVE_MESSAGING_PATHS.connect, {
      token: BRIDGE_TOKEN,
      portId,
      hostName: HOST_NAME,
    }),
  ) as Promise<Response>;
}

function createNativeMessaging(options: ConstructorParameters<typeof NativeMessaging>[0] = {}) {
  const nativeMessaging = new NativeMessaging({
    ...options,
    hostManifestSearch: { homeDir: workDir },
  });

  const bridge = new ExtensionBridge();

  nativeMessaging.registerRoutes(bridge);

  bridge.setupSession(session, {
    getExtensionId: (bridgeToken) => (bridgeToken === BRIDGE_TOKEN ? EXTENSION_ID : undefined),
  });

  return {
    nativeMessaging,
    teardown: () => {
      bridge.teardownSession(session);

      nativeMessaging.teardownSession(session);
    },
  };
}

/** Kill with signal 0 probes for existence, and ESRCH says the process is gone. */
async function waitForProcessExit(pid: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  throw new Error(`Process ${pid} is still running`);
}

/** Reads frames off a connect response until one has arrived. */
async function readFrame(response: Response) {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();

  const decoder = new NativeMessageDecoder();

  for (;;) {
    const { value, done } = await reader.read();

    if (done) {
      return undefined;
    }

    const [frame] = decoder.push(value) as NativeMessagingFrame[];

    if (frame) {
      return frame;
    }
  }
}

describe("NativeMessaging", () => {
  test("carries messages both ways and tells the host who is calling", async () => {
    await writeHostManifest();

    const { teardown } = createNativeMessaging();

    const response = await connect();

    expect(response.status).toBe(200);

    await requestHandler?.(
      createRequest(NATIVE_MESSAGING_PATHS.post, {
        token: BRIDGE_TOKEN,
        portId: "port-1",
        message: { hello: "host" },
      }),
    );

    expect(await readFrame(response)).toEqual({
      type: "message",
      message: { echo: { hello: "host" }, origin: `chrome-extension://${EXTENSION_ID}/` },
    });

    teardown();
  });

  test("disconnects when the host does not list the extension", async () => {
    await writeHostManifest("b".repeat(32));

    createNativeMessaging();

    expect(await readFrame(await connect())).toEqual({
      type: "disconnect",
      error: "Access to the specified native messaging host is forbidden.",
    });
  });

  test("disconnects when no manifest names the host", async () => {
    createNativeMessaging();

    expect(await readFrame(await connect())).toEqual({
      type: "disconnect",
      error: "Specified native messaging host not found.",
    });
  });

  test("lets an embedder refuse a host the manifest allows", async () => {
    await writeHostManifest();

    createNativeMessaging({ isHostAllowed: () => false });

    expect(await readFrame(await connect())).toEqual({
      type: "disconnect",
      error: "Access to the specified native messaging host is forbidden.",
    });
  });

  test("kills the host when the extension side cancels the stream", async () => {
    await writeHostManifest();

    const logs: { message: string; details: Record<string, unknown> }[] = [];

    const { teardown } = createNativeMessaging({
      logger: {
        info: (message, details) => {
          logs.push({ message, details });
        },
        error: () => undefined,
      },
    });

    const response = await connect();

    const hostPid = logs.find(({ message }) => message === "Connected native messaging host")
      ?.details.pid as number;

    expect(hostPid).toBeGreaterThan(0);

    // The extension context went away: a closed page, a restarted service worker
    await (response.body as ReadableStream<Uint8Array>).cancel();

    expect(logs.some(({ message }) => message === "Disconnected native messaging host")).toBe(true);

    await waitForProcessExit(hostPid);

    teardown();
  });

  test("takes the session's ports down with the session", async () => {
    await writeHostManifest();

    const { teardown } = createNativeMessaging();

    const response = await connect();

    teardown();

    expect(requestHandler).toBeUndefined();
    expect(await readFrame(response)).toEqual({ type: "disconnect", error: undefined });
  });
});
