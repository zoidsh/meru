import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $$ } from "select-dom";

const isLoadClippedMessagesEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.loadClippedMessages,
);

// Gmail cuts a body over about 102 KB on the server, so the rest is never in
// the page. The "View entire message" link opens the print view of that one
// message, which carries the whole body, sanitized and with images proxied
// the same way as the inline view.
const clippedMessageLinkSelector = '.iX > a[href*="view=lg"]';

const removedElementSelector =
  "script, iframe, frame, object, embed, applet, form, base, meta, link, noscript, template";

const allowedUrlProtocols = new Set(["http:", "https:", "mailto:"]);

const urlAttributeNames = new Set(["href", "src", "action", "formaction", "xlink:href"]);

const loadedMessageCacheSize = 5;

const loadedMessages = new Map<string, Promise<Element>>();

const handledLinks = new WeakSet<HTMLAnchorElement>();

function parseFullMessageUrl(href: string) {
  const url = new URL(href, window.location.href);

  if (
    url.origin !== window.location.origin ||
    url.searchParams.get("view") !== "lg" ||
    !url.searchParams.get("permmsgid")
  ) {
    return null;
  }

  return url;
}

function isAllowedUrl(name: string, value: string) {
  let protocol: string;

  try {
    protocol = new URL(value, window.location.href).protocol;
  } catch {
    return false;
  }

  return (
    allowedUrlProtocols.has(protocol) ||
    (name === "src" && protocol === "data:" && /^data:image\//i.test(value.trim()))
  );
}

// Gmail's server sanitizes the print view as it does the inline one; this
// keeps anything that runs code out of the page should that ever change.
function sanitize(root: Element) {
  for (const element of root.querySelectorAll(removedElementSelector)) {
    element.remove();
  }

  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const name of element.getAttributeNames()) {
      if (
        name.startsWith("on") ||
        (urlAttributeNames.has(name) && !isAllowedUrl(name, element.getAttribute(name) ?? ""))
      ) {
        element.removeAttribute(name);
      }
    }
  }

  // Gmail's view has no navigation guard, so a link without a target would
  // replace Gmail itself rather than open through the window-open handler.
  for (const link of root.querySelectorAll("a[href]")) {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }
}

// Gmail requires Trusted Types, and the preload's world inherits that. The
// policy passes HTML through unchanged because it only ever feeds DOMParser,
// whose document runs no scripts and loads nothing; `sanitize` runs before a
// node from it reaches Gmail's page. Should Gmail's CSP ever allowlist policy
// names, `createPolicy` throws and every clipped message logs that error.
type HtmlPolicy = { createHTML: (input: string) => string };

let parserPolicy: HtmlPolicy | undefined;

function parseHtml(html: string) {
  const { trustedTypes } = window as Window & {
    trustedTypes?: { createPolicy: (name: string, rules: HtmlPolicy) => HtmlPolicy };
  };

  parserPolicy ??= trustedTypes?.createPolicy("meru-clipped-messages", {
    createHTML: (input) => input,
  });

  return new DOMParser().parseFromString(parserPolicy?.createHTML(html) ?? html, "text/html");
}

function extractMessageBody(html: string) {
  const messageTables = parseHtml(html).querySelectorAll("table.message");

  const bodyElements = messageTables[messageTables.length - 1]?.querySelectorAll('font[size="-1"]');

  const bodyElement = bodyElements?.[bodyElements.length - 1];

  if (!bodyElement) {
    throw new Error("The full message has no message body");
  }

  sanitize(bodyElement);

  return bodyElement;
}

function loadFullMessageBody(url: URL) {
  const cacheKey = url.searchParams.get("permmsgid") ?? url.href;

  const cached = loadedMessages.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetch(url).then(async (response) => {
    // Signed out, Gmail redirects to a sign-in page that answers 200.
    if (!response.ok || new URL(response.url).origin !== window.location.origin) {
      throw new Error(`Loading the full message failed with status ${response.status}`);
    }

    return extractMessageBody(await response.text());
  });

  request.catch(() => {
    if (loadedMessages.get(cacheKey) === request) {
      loadedMessages.delete(cacheKey);
    }
  });

  loadedMessages.set(cacheKey, request);

  if (loadedMessages.size > loadedMessageCacheSize) {
    const [oldestKey] = loadedMessages.keys();

    if (oldestKey) {
      loadedMessages.delete(oldestKey);
    }
  }

  return request;
}

async function loadClippedMessage(link: HTMLAnchorElement, url: URL) {
  const clippedBodyElement = link.closest(".iX")?.parentElement;

  if (!clippedBodyElement?.closest(".a3s")) {
    return;
  }

  const bodyElement = await loadFullMessageBody(url);

  if (!link.isConnected) {
    return;
  }

  clippedBodyElement.replaceChildren(...document.importNode(bodyElement, true).childNodes);
}

export function loadClippedMessages() {
  if (!isLoadClippedMessagesEnabled) {
    return;
  }

  for (const link of $$<HTMLAnchorElement>(clippedMessageLinkSelector)) {
    if (handledLinks.has(link)) {
      continue;
    }

    handledLinks.add(link);

    const url = parseFullMessageUrl(link.href);

    if (!url) {
      continue;
    }

    loadClippedMessage(link, url).catch((error) => {
      console.error("Error loading clipped message:", error);
    });
  }
}
