import type { Session } from "electron";
import type { ExtensionsLogger } from "../logger";
import {
  NATIVE_MESSAGING_PATHS,
  NATIVE_MESSAGING_SCHEME,
  type NativeMessagingConnectRequest,
  type NativeMessagingDisconnectRequest,
  type NativeMessagingFrame,
  type NativeMessagingPostRequest,
  type NativeMessagingRequest,
} from "./bridge-protocol";
import { encodeNativeMessage } from "./framing";
import { NativeMessagingHost } from "./host";
import {
  findHostManifest,
  type HostManifestSearchOptions,
  isExtensionAllowed,
  resolveHostPath,
} from "./host-manifest";

/** The errors Chrome hands the extension, kept word for word. */
const HOST_NOT_FOUND_ERROR = "Specified native messaging host not found.";

const HOST_FORBIDDEN_ERROR = "Access to the specified native messaging host is forbidden.";

/**
 * Whether an extension may drive this host. The host's own `allowed_origins`
 * has already said yes by the time this is asked; an embedder that wants a
 * narrower rule than "whatever the host trusts" says no here.
 */
export type NativeMessagingHostPolicy = (details: {
  session: Session;
  extensionId: string;
  hostName: string;
  manifestPath: string;
  hostPath: string;
}) => boolean | Promise<boolean>;

export type NativeMessagingOptions = {
  isHostAllowed?: NativeMessagingHostPolicy;
  /**
   * Where host manifests are looked up, defaulting to the locations the running
   * platform's Chromium browsers use.
   */
  hostManifestSearch?: HostManifestSearchOptions;
  logger?: ExtensionsLogger;
};

type NativeMessagingSession = {
  /** The extension whose copy of the facade carries this token, if any. */
  getExtensionId: (bridgeToken: string) => string | undefined;
};

type NativeMessagingPort = {
  id: string;
  session: Session;
  extensionId: string;
  hostName: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  host?: NativeMessagingHost;
  isClosed: boolean;
};

/**
 * `chrome.runtime.connectNative` and `sendNativeMessage` for extensions loaded
 * into Electron sessions.
 *
 * Electron ships Chromium's native messaging plumbing with the door nailed
 * shut: `ElectronMessagingDelegate::IsNativeMessagingHostAllowed` returns
 * `DISALLOW` and `CreateReceiverForNativeApp` returns nullptr, so the built-in
 * `connectNative` disconnects every port with "Access to the native messaging
 * host was disabled by the system administrator" no matter where a host
 * manifest sits. The facade therefore replaces both methods and they land here,
 * which finds the host manifest the way Chromium would, honours its
 * `allowed_origins`, and runs one host process per port.
 */
export class NativeMessaging {
  private options: NativeMessagingOptions;

  private sessions = new Map<Session, NativeMessagingSession>();

  private ports = new Map<string, NativeMessagingPort>();

  constructor(options: NativeMessagingOptions = {}) {
    this.options = options;

    // Host processes are children of this process and outlive an abrupt exit,
    // and every path out of the app passes through here
    process.once("exit", () => {
      for (const port of this.ports.values()) {
        port.host?.kill();
      }
    });
  }

  setupSession(session: Session, sessionOptions: NativeMessagingSession) {
    this.sessions.set(session, sessionOptions);

    session.protocol.handle(NATIVE_MESSAGING_SCHEME, (request) =>
      this.handleRequest(session, request),
    );
  }

  teardownSession(session: Session) {
    if (!this.sessions.delete(session)) {
      return;
    }

    session.protocol.unhandle(NATIVE_MESSAGING_SCHEME);

    for (const port of this.ports.values()) {
      if (port.session === session) {
        this.closePort(port);
      }
    }
  }

  private async handleRequest(session: Session, request: GlobalRequest) {
    const headers = {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "cache-control": "no-store",
    };

    const { pathname } = new URL(request.url);

    try {
      const body = (await request.json()) as NativeMessagingRequest;

      // Everything else in the session — Gmail, workspace apps, any page a user
      // navigated to — can reach this scheme just as well, and only the loaded
      // extensions know a token
      const extensionId = this.sessions.get(session)?.getExtensionId(body.token);

      if (!extensionId) {
        return new Response(null, { status: 403, headers });
      }

      if (pathname === NATIVE_MESSAGING_PATHS.connect) {
        return this.handleConnect(
          session,
          extensionId,
          body as NativeMessagingConnectRequest,
          headers,
        );
      }

      if (pathname === NATIVE_MESSAGING_PATHS.post) {
        this.handlePost(session, extensionId, body as NativeMessagingPostRequest);

        return new Response(null, { status: 204, headers });
      }

      if (pathname === NATIVE_MESSAGING_PATHS.disconnect) {
        const port = this.getPort(
          session,
          extensionId,
          (body as NativeMessagingDisconnectRequest).portId,
        );

        if (port) {
          this.closePort(port);
        }

        return new Response(null, { status: 204, headers });
      }
    } catch (error) {
      this.options.logger?.error("Native messaging request failed", { pathname, error });

      return new Response(null, { status: 400, headers });
    }

    return new Response(null, { status: 404, headers });
  }

  /**
   * The response is held back until the host is running or has failed to start,
   * because the extension takes it as the sign that the port exists and posts
   * the moment it arrives. A message that overtook the host process would have
   * nowhere to go.
   */
  private async handleConnect(
    session: Session,
    extensionId: string,
    { portId, hostName }: NativeMessagingConnectRequest,
    headers: Record<string, string>,
  ) {
    if (typeof portId !== "string" || typeof hostName !== "string" || this.ports.has(portId)) {
      return new Response(null, { status: 400, headers });
    }

    let port: NativeMessagingPort | undefined;

    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        port = { id: portId, session, extensionId, hostName, controller, isClosed: false };

        this.ports.set(portId, port);
      },
      pull: () => {
        port?.host?.resumeReading();
      },
      cancel: () => {
        // The extension context went away — a closed page, a restarted service
        // worker — and its host has to go with it
        if (port) {
          this.closePort(port);
        }
      },
    });

    if (port) {
      await this.startHost(port);
    }

    return new Response(body, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  private async startHost(port: NativeMessagingPort) {
    const found = await findHostManifest(port.hostName, this.options.hostManifestSearch);

    if (!found) {
      this.closePort(port, HOST_NOT_FOUND_ERROR);

      return;
    }

    const hostPath = resolveHostPath(found.manifestPath, found.manifest);

    const isAllowed =
      isExtensionAllowed(found.manifest, port.extensionId) &&
      (await (this.options.isHostAllowed?.({
        session: port.session,
        extensionId: port.extensionId,
        hostName: port.hostName,
        manifestPath: found.manifestPath,
        hostPath,
      }) ?? true));

    if (!isAllowed) {
      this.closePort(port, HOST_FORBIDDEN_ERROR);

      return;
    }

    // Awaiting the manifest and the policy gave the extension time to disconnect
    if (port.isClosed) {
      return;
    }

    port.host = new NativeMessagingHost({
      hostPath,
      extensionOrigin: `chrome-extension://${port.extensionId}/`,
      onStderr: (output) => {
        this.options.logger?.info("Native messaging host wrote to stderr", {
          hostName: port.hostName,
          output,
        });
      },
      handlers: {
        onMessage: (message) => {
          this.sendFrame(port, { type: "message", message });
        },
        onClose: (error) => {
          this.closePort(port, error?.message);
        },
      },
    });

    this.options.logger?.info("Connected native messaging host", {
      hostName: port.hostName,
      extensionId: port.extensionId,
      manifestPath: found.manifestPath,
      hostPath,
      pid: port.host.pid,
    });
  }

  private handlePost(session: Session, extensionId: string, request: NativeMessagingPostRequest) {
    this.getPort(session, extensionId, request.portId)?.host?.postMessage(request.message);
  }

  private getPort(session: Session, extensionId: string, portId: string) {
    const port = this.ports.get(portId);

    if (!port || port.session !== session || port.extensionId !== extensionId) {
      return undefined;
    }

    return port;
  }

  private sendFrame(port: NativeMessagingPort, frame: NativeMessagingFrame) {
    if (port.isClosed) {
      return;
    }

    try {
      port.controller.enqueue(encodeNativeMessage(frame));
    } catch {
      // The stream no longer accepts frames when the extension cancelled it —
      // a closed page, a restarted service worker — and a throw out of here
      // would keep `closePort` from killing the port's host process
      return;
    }

    // Stop reading the host until the extension has taken what it was sent
    if ((port.controller.desiredSize ?? 1) <= 0) {
      port.host?.pauseReading();
    }
  }

  private closePort(port: NativeMessagingPort, error?: string) {
    if (port.isClosed) {
      return;
    }

    this.sendFrame(port, { type: "disconnect", error });

    port.isClosed = true;

    this.ports.delete(port.id);

    port.host?.kill();

    try {
      port.controller.close();
    } catch {
      // The stream is already gone when the extension cancelled it
    }

    this.options.logger?.info("Disconnected native messaging host", {
      hostName: port.hostName,
      extensionId: port.extensionId,
      pid: port.host?.pid,
      error,
    });
  }
}
