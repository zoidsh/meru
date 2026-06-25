import { ipc } from "@meru/shared/renderer/ipc";
import { $ } from "select-dom";

export function observeOutOfOfficeBanner() {
  const outOfOfficeElement = $("#\\:7:has(div#\\:k)");

  ipc.main.send("gmail.setOutOfOffice", Boolean(outOfOfficeElement));
}
