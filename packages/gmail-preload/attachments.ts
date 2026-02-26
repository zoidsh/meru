import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $, $$ } from "select-dom";

const attachmentsSelector = ".hq.gt";
const messageWithAttachmentsSelector = `div:has(> ${attachmentsSelector})`;
const horizontalLineClassName = "hp";

const isMoveAttachmentsToTopEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.moveAttachmentsToTop,
);

export function moveAttachmentsToTop() {
  if (!isMoveAttachmentsToTopEnabled) {
    return;
  }

  const messageWithAttachmentsElements = $$(messageWithAttachmentsSelector);

  for (const messageWithAttachmentsElement of messageWithAttachmentsElements) {
    const attachmentsElement = $(attachmentsSelector, messageWithAttachmentsElement);

    if (!attachmentsElement || messageWithAttachmentsElement.firstChild === attachmentsElement) {
      continue;
    }

    const horizontalLineElement = document.createElement("div");

    horizontalLineElement.className = horizontalLineClassName;
    horizontalLineElement.style.marginTop = "16px";

    attachmentsElement.append(horizontalLineElement);

    messageWithAttachmentsElement.prepend(attachmentsElement);
  }
}
