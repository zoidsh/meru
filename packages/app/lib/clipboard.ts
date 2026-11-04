import { ClipboardItem, clipboard } from "electron";
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
export function copyText(text: string) {
  return attemptWrite(() => clipboard.writeText(text));
}

/**
 * Writes `url` to the system clipboard as text and as a bookmark named `title`,
 * answering whether the write landed, as `copyText` does.
 */
export function copyBookmark(title: string, url: string) {
  return attemptWrite(() =>
    clipboard.write([
      new ClipboardItem({
        "text/plain": url,
        "electron application/bookmark": { title, url },
      }),
    ]),
  );
}

async function attemptWrite(write: () => Promise<void>) {
  try {
    await write();

    return true;
  } catch (error) {
    log.error("Failed to copy to the clipboard", { error: serializeError(error) });

    return false;
  }
}
