import { ipc } from "@meru/shared/renderer/ipc";
import { $ } from "select-dom";
import { createNotMatchingAttributeSelector } from "./lib/utils";

const userEmailElementProcessedAttribute = "data-meru-user-email";

export function setUserEmail() {
  const userEmailElement = $(
    createNotMatchingAttributeSelector(
      "meta[name='og-profile-acct']",
      userEmailElementProcessedAttribute,
    ),
  );

  const userEmail = userEmailElement?.getAttribute("content");

  if (!userEmailElement || !userEmail) {
    return;
  }

  userEmailElement.setAttribute(userEmailElementProcessedAttribute, "");

  ipc.main.send("gmail.setUserEmail", userEmail);
}
