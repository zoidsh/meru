import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";
import {
  createNotMatchingAttributeSelector,
  createElementAttributeFromPreloadArgument,
} from "./lib/utils";

const isOpenComposeInNewWindowEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
);

const composeButtonProcessedAttribute = createElementAttributeFromPreloadArgument(
  GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
);

const composeButtonElementSelector = createNotMatchingAttributeSelector(
  ".T-I.T-I-KE.L3",
  composeButtonProcessedAttribute,
);

export async function openComposeInNewWindow() {
  if (!isOpenComposeInNewWindowEnabled) {
    return;
  }

  const composeButtonElement = $(composeButtonElementSelector);

  if (!composeButtonElement) {
    return;
  }

  composeButtonElement.setAttribute(composeButtonProcessedAttribute, "");

  let isClicked = false;

  composeButtonElement.addEventListener("click", (event) => {
    if (isClicked) {
      isClicked = false;

      return;
    }

    isClicked = true;

    event.stopPropagation();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      shiftKey: true,
    });

    composeButtonElement.dispatchEvent(clickEvent);
  });
}
