import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";
import {
  createNotMatchingAttributeSelector,
  createElementAttributeFromPreloadArgument,
  reEmitClickWithShiftKey,
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

  reEmitClickWithShiftKey(composeButtonElement);
}
