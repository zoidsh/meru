import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

import { noop } from "es-toolkit";

interface EvaluateResult {
  result?: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
}

/**
 * The main process's Node inspector, which `--inspect=0` opens. It is used in
 * place of Chromium's remote debugging port, which Google refuses a sign-in
 * behind and may challenge a signed-in session for.
 */
export interface Inspector {
  /** Evaluates an expression in main, where `require("electron")` works. */
  evaluate: <T>(expression: string) => Promise<T>;
  close: () => void;
}

const LISTENING = /Debugger listening on (?<url>ws:\/\/\S+)/u;
const KEPT_STDERR = 16_384;

/**
 * Drains the child's stderr, which would otherwise fill its pipe and stall it,
 * keeping the tail for a failure's message and resolving the inspector's
 * address once the child prints it.
 */
export const watchStderr = (child: ChildProcess) => {
  let tail = "";
  const {
    promise: inspectorUrl,
    resolve: resolveUrl,
    reject: rejectUrl,
  } = Promise.withResolvers<string>();

  // Unawaited when a target has no inspector.
  inspectorUrl.catch(noop);

  child.stderr?.on("data", (chunk: Buffer) => {
    tail = (tail + chunk.toString()).slice(-KEPT_STDERR);
    const url = LISTENING.exec(tail)?.groups?.url;

    if (url) {
      resolveUrl(url);
    }
  });
  child.once("exit", () => {
    rejectUrl(new Error("The target exited before its inspector listened."));
  });

  return { inspectorUrl, tail: () => tail };
};

export const connectInspector = async (url: string): Promise<Inspector> => {
  const socket = new WebSocket(url);
  const pending = new Map<
    number,
    { resolve: (value: EvaluateResult) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  await Promise.race([
    once(socket, "open"),
    once(socket, "error").then(() => {
      throw new Error(`Could not reach the inspector at ${url}.`);
    }),
  ]);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: EvaluateResult;
      error?: { message: string };
    };
    const call = message.id === undefined ? undefined : pending.get(message.id);

    if (!call || message.id === undefined) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      call.reject(new Error(message.error.message));
    } else {
      call.resolve(message.result ?? {});
    }
  });

  socket.addEventListener("close", () => {
    for (const call of pending.values()) {
      call.reject(new Error("The inspector closed."));
    }

    pending.clear();
  });

  const evaluate = async <T>(expression: string): Promise<T> => {
    const id = nextId;

    nextId += 1;

    const {
      promise: reply,
      resolve,
      reject,
    } = Promise.withResolvers<EvaluateResult>();

    pending.set(id, { resolve, reject });
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
          // Brings in the console's `require`, which an ES module main lacks.
          includeCommandLineAPI: true,
        },
      })
    );

    const { result, exceptionDetails } = await reply;

    if (exceptionDetails) {
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text
      );
    }

    return result?.value as T;
  };

  return { evaluate, close: () => socket.close() };
};
