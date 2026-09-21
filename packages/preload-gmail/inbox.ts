import {
  createGmailMessageActionRequest,
  type GmailAction,
  GMAIL_URL,
  parseGmailIdKey,
} from "@meru/shared/gmail";
import { $ } from "select-dom";
import { inboxAnchorElementSelector, refreshButtonElementSelector } from "./lib/selectors";

declare global {
  interface Window {
    GM_ID_KEY: string;
  }
}

let gmailIdKey: string | undefined;

export async function sendMailAction(mailId: string, action: GmailAction) {
  if (!gmailIdKey) {
    const gmailDocument = await fetch(GMAIL_URL).then((res) => res.text());

    gmailIdKey = parseGmailIdKey(gmailDocument) ?? undefined;

    if (!gmailIdKey) {
      throw new Error("Gmail ID key is missing");
    }
  }

  const gmailActionToken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("GMAIL_AT="))
    ?.split("=")[1];

  if (!gmailActionToken) {
    throw new Error("Action token is missing");
  }

  const { url, body } = createGmailMessageActionRequest({
    messageId: mailId,
    action,
    idKey: gmailIdKey,
    actionToken: gmailActionToken,
  });

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body,
  });

  await res.text();
}

/*
 * Gmail's Refresh control is bound to the raw pointer and mouse sequence, so
 * `HTMLElement.click()` on it does nothing. Dispatching the full sequence
 * syncs within a fifth of a second, with a thread open as well as on the list.
 */
export function refreshInbox() {
  const refreshButtonElement = $(refreshButtonElementSelector);

  if (refreshButtonElement) {
    const { left, top, width, height } = refreshButtonElement.getBoundingClientRect();

    const eventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: left + width / 2,
      clientY: top + height / 2,
    };

    const previouslyFocusedElement = document.activeElement;

    refreshButtonElement.dispatchEvent(new PointerEvent("pointerdown", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("mousedown", eventInit));
    refreshButtonElement.dispatchEvent(new PointerEvent("pointerup", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("mouseup", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("click", eventInit));

    // Gmail clears the pressed and focused look only on leave and blur, which
    // no real pointer is there to send after a synthetic click.
    refreshButtonElement.dispatchEvent(
      new PointerEvent("pointerout", { ...eventInit, relatedTarget: null }),
    );
    refreshButtonElement.dispatchEvent(
      new PointerEvent("pointerleave", { ...eventInit, relatedTarget: null }),
    );
    refreshButtonElement.dispatchEvent(
      new MouseEvent("mouseout", { ...eventInit, relatedTarget: null }),
    );
    refreshButtonElement.dispatchEvent(
      new MouseEvent("mouseleave", { ...eventInit, relatedTarget: null }),
    );

    // Gmail focuses the control on mousedown, which would take the caret out of
    // a compose editor on every programmatic refresh; Chromium keeps the
    // selection when the editor is refocused.
    if (document.activeElement === refreshButtonElement) {
      if (
        previouslyFocusedElement instanceof HTMLElement &&
        previouslyFocusedElement !== document.body
      ) {
        previouslyFocusedElement.focus();
      } else {
        refreshButtonElement.blur();
      }
    }

    return;
  }

  if (window.location.hash.startsWith("#inbox")) {
    const inboxAnchorElement = $(inboxAnchorElementSelector);

    if (inboxAnchorElement) {
      inboxAnchorElement.click();
    }
  }
}
