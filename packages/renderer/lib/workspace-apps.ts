import { platform } from "@meru/shared/renderer/utils";
import type { MouseEvent } from "react";

export function getModifierOpenBehavior(event: MouseEvent) {
  if (platform.isMacOS ? event.metaKey : event.ctrlKey) {
    return event.shiftKey ? "tab" : "backgroundTab";
  }

  if (event.shiftKey) {
    return "newWindow";
  }
}
