import { GMAIL_ACTION_CODE_MAP, GMAIL_URL } from "@meru/shared/gmail";
import { $ } from "select-dom";
import { inboxAnchorElementSelector, refreshButtonElementSelector } from "./lib/selectors";

declare global {
  interface Window {
    GM_ID_KEY: string;
  }
}

let gmailIdKey: string | undefined;

async function fetchGmail(path = "", fetchOptions?: Parameters<typeof fetch>[1]) {
  return fetch(`${GMAIL_URL}${path}`, fetchOptions);
}

export async function sendMailAction(mailId: string, action: keyof typeof GMAIL_ACTION_CODE_MAP) {
  if (!gmailIdKey) {
    const gmailDocument = await fetchGmail().then((res) => res.text());

    gmailIdKey = /var GM_ID_KEY = '([a-z0-9]+)';/.exec(gmailDocument)?.[1];

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

  const command = "l:all";
  const labels: [] = [];
  const ids: [] = [];
  const actionCode = GMAIL_ACTION_CODE_MAP[action];

  const body = new FormData();

  body.append(
    "s_jr",
    JSON.stringify([
      null,
      [
        [null, null, null, [null, actionCode, mailId, mailId, command, [], labels, ids]],
        [null, null, null, null, null, null, [null, true, false]],
        [null, null, null, null, null, null, [null, true, false]],
      ],
      2,
      null,
      null,
      null,
      gmailIdKey,
    ]),
  );

  const res = await fetchGmail(
    `/s/?v=or&ik=${gmailIdKey}&at=${gmailActionToken}&subui=chrome&hl=en&ts=${Date.now()}`,
    {
      method: "POST",
      credentials: "include",
      body,
    },
  );

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

    refreshButtonElement.dispatchEvent(new PointerEvent("pointerdown", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("mousedown", eventInit));
    refreshButtonElement.dispatchEvent(new PointerEvent("pointerup", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("mouseup", eventInit));
    refreshButtonElement.dispatchEvent(new MouseEvent("click", eventInit));

    return;
  }

  if (window.location.hash.startsWith("#inbox")) {
    const inboxAnchorElement = $(inboxAnchorElementSelector);

    if (inboxAnchorElement) {
      inboxAnchorElement.click();
    }
  }
}
