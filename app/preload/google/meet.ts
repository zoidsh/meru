import type { MeetToggle } from "../../shared/channels/google.ts";
import { isHtmlElement, queryAll } from "../content/query.ts";

// Meet's microphone and camera carry no name of their own, only whether they are muted; they sit in that order in the call's controls.
const ORDER: readonly MeetToggle[] = ["microphone", "camera"];

/** Presses Meet's own microphone or camera button, and does nothing where the call shows neither. */
export const toggleMeet = (document: Document, toggle: MeetToggle): void => {
  const buttons = queryAll(document, "button[data-is-muted]", isHtmlElement);
  buttons[ORDER.indexOf(toggle)]?.click();
};
