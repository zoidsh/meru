import { $ } from "select-dom";
import { ipcMain } from "./ipc";
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

  ipcMain.send("gmail.setUserEmail", userEmail);
}
