import { clipboard } from "electron";
import { serializeError } from "serialize-error";
import { log } from "./log";

/**
 * Writes `text` to the system clipboard, reporting a failure rather than
 * throwing.
 *
 * Electron 44 rebuilt `clipboard` on the W3C API, so `writeText` resolves once
 * the write lands instead of returning when it is queued. Every call site is a
 * menu click or a notification handler with no caller to hand a rejection to,
 * so a floating `writeText` would surface as an unhandled rejection; awaiting
 * inside here keeps that contained and gives a caller that does care — the
 * verification code copy — something to sequence against.
 */
export async function copyText(text: string) {
  try {
    await clipboard.writeText(text);
  } catch (error) {
    log.error("Failed to copy to the clipboard", { error: serializeError(error) });
  }
}
