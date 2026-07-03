import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $$ } from "select-dom";

const isShowEntireMessageEnabled = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.showEntireMessage);

const processedAttribute = "data-meru-entire-message";

const viewEntireMessageLinkSelector = ".iX > a";

const fullMessageBodySelector = "font[size='-1']";

const injectEntireMessage = async (viewEntireMessageLink: HTMLAnchorElement) => {
  try {
    const response = await fetch(viewEntireMessageLink.href, { credentials: "include" });

    const fullMessageHtml = await response.text();

    const fullMessageDocument = new DOMParser().parseFromString(fullMessageHtml, "text/html");

    const fullMessageBody = $$(fullMessageBodySelector, fullMessageDocument).at(-1);

    if (!fullMessageBody) {
      return;
    }

    const messageBody = viewEntireMessageLink.closest(".a3s");

    if (messageBody) {
      messageBody.innerHTML = fullMessageBody.innerHTML;
    }
  } catch (error) {
    console.error("Error expanding clipped message:", error);
  }
};

export function showEntireMessage() {
  if (!isShowEntireMessageEnabled) {
    return;
  }

  const viewEntireMessageLinks = $$<HTMLAnchorElement>(viewEntireMessageLinkSelector);

  for (const viewEntireMessageLink of viewEntireMessageLinks) {
    if (viewEntireMessageLink.hasAttribute(processedAttribute)) {
      continue;
    }

    viewEntireMessageLink.setAttribute(processedAttribute, "");

    injectEntireMessage(viewEntireMessageLink);
  }
}
