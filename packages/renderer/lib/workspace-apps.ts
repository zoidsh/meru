import type { MouseEvent } from "react";
import { platform } from "./utils";

export function getModifierOpenBehavior(event: MouseEvent) {
  if (platform.isMacOS ? event.metaKey : event.ctrlKey) {
    return event.shiftKey ? "tab" : "backgroundTab";
  }

  if (event.shiftKey) {
    return "newWindow";
  }
}
