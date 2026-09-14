import { clipboard } from "electron";
import { serializeError } from "serialize-error";
import { log } from "./log";

/**
 * Writes `text` to the system clipboard, answering whether the write landed.
 *
 * Electron 44 rebuilt `clipboard` on the W3C API, so `writeText` resolves once
 * the write lands instead of returning when it is queued. Most call sites are a
 * menu click with no caller to hand a rejection to, so a floating `writeText`
 * would surface as an unhandled rejection; awaiting inside here keeps that
 * contained. The answer is for the one caller that has something riding on the
 * write — the verification code copy, which marks the email read and deletes it
 * only once the code is really on the clipboard.
 */
export async function copyText(text: string) {
  try {
    await clipboard.writeText(text);

    return true;
  } catch (error) {
    log.error("Failed to copy to the clipboard", { error: serializeError(error) });

    return false;
  }
}
