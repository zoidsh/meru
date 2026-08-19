import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { encodeNativeMessage, NativeMessageDecoder } from "./framing";

export type NativeMessagingHostHandlers = {
  onMessage: (message: unknown) => void;
  /** The host is gone, and nothing more will be read from or written to it. */
  onClose: (error?: Error) => void;
};

export type NativeMessagingHostOptions = {
  hostPath: string;
  /** `chrome-extension://<id>/`, which is how a host knows who is calling. */
  extensionOrigin: string;
  handlers: NativeMessagingHostHandlers;
  onStderr?: (output: string) => void;
};

/**
 * One native messaging host process for the lifetime of one port, spoken to the
 * way Chrome does it: the calling extension's origin as the first argument, and
 * length-prefixed JSON over the host's stdio.
 */
export class NativeMessagingHost {
  private process: ChildProcess;

  private decoder = new NativeMessageDecoder();

  private handlers: NativeMessagingHostHandlers;

  private isClosed = false;

  constructor({ hostPath, extensionOrigin, handlers, onStderr }: NativeMessagingHostOptions) {
    this.handlers = handlers;

    this.process = spawn(hostPath, this.getArguments(extensionOrigin), {
      // Hosts are shipped next to the files they read, and Chrome starts them
      // from their own directory
      cwd: path.dirname(hostPath),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.readMessages(chunk);
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      onStderr?.(chunk.toString("utf8").trimEnd());
    });

    this.process.on("error", (error) => {
      this.close(error);
    });

    this.process.on("exit", (code, signal) => {
      // A host closing the connection by quitting is what Chrome reports as
      // this, and the extension has no other way of hearing about it
      this.close(
        new Error(
          code === null
            ? `Native host has exited (${signal}).`
            : `Native host has exited with code ${code}.`,
        ),
      );
    });

    // A host that never reads stdin still must not take Meru down with it
    this.process.stdin?.on("error", (error) => {
      this.close(error);
    });
  }

  get pid() {
    return this.process.pid;
  }

  private getArguments(extensionOrigin: string) {
    if (process.platform === "win32") {
      // Chrome passes the calling window's handle on Windows, and hosts that
      // parent a dialog on it expect the argument to be there
      return [extensionOrigin, "--parent-window=0"];
    }

    return [extensionOrigin];
  }

  private readMessages(chunk: Buffer) {
    if (this.isClosed) {
      return;
    }

    let messages: unknown[];

    try {
      messages = this.decoder.push(chunk);
    } catch (error) {
      this.kill();

      this.close(error instanceof Error ? error : new Error(String(error)));

      return;
    }

    for (const message of messages) {
      this.handlers.onMessage(message);
    }
  }

  /** Backpressure: a host that talks faster than the extension reads waits. */
  pauseReading() {
    this.process.stdout?.pause();
  }

  resumeReading() {
    this.process.stdout?.resume();
  }

  postMessage(message: unknown) {
    if (this.isClosed) {
      return;
    }

    this.process.stdin?.write(encodeNativeMessage(message));
  }

  /**
   * Ends the host. Closing stdin is how a host is told to shut down, and
   * terminating the process covers the hosts that ignore it.
   */
  kill() {
    if (this.isClosed) {
      return;
    }

    this.process.stdin?.end();

    this.process.kill();
  }

  private close(error?: Error) {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    this.handlers.onClose(error);
  }
}
