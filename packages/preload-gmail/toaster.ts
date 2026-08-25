/*
 * The "Message sent / Undo" toast, built by hand rather than by sonner.
 *
 * This is the only toast the Gmail preload has ever shown, and reaching it
 * through sonner meant every Gmail renderer — and every OAuth and sign-in page,
 * since the preload evaluates before its hostname check — loaded react-dom,
 * sonner, lucide and the interface's compiled Tailwind: about 484 KB of a
 * 720 KB preload for one notification with one action.
 *
 * A lazy import would not have helped. Preloads are bundled with
 * `codeSplitting: false` and the Gmail view runs sandboxed, so there is no
 * chunk to fetch at runtime; rolldown inlines the dynamic import and evaluates
 * it at the top level anyway.
 *
 * What sonner gave for free and is gone: swipe-to-dismiss and hover-to-expand.
 * Stacking is not, because several compose windows can each have a toast
 * outstanding, keyed by their window id — a flex column covers it.
 */
import { ipc } from "@meru/shared/renderer/ipc";
import toasterStyles from "./toaster.css";

const SHADOW_HOST_ID = "meru-toaster";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Matches the animation durations in `toaster.css`. */
const LEAVE_ANIMATION_MS = 400;

const toasts = new Map<number, HTMLElement>();

let toaster: HTMLElement | undefined;

function createSvgElement(tagName: string, attributes: Record<string, string>) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

/** lucide's `circle-check`, at the 16px the interface renders it at. */
function createSuccessIcon() {
  const icon = createSvgElement("svg", {
    xmlns: SVG_NAMESPACE,
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  icon.append(
    createSvgElement("circle", { cx: "12", cy: "12", r: "10" }),
    createSvgElement("path", { d: "m9 12 2 2 4-4" }),
  );

  return icon;
}

/** sonner's own close icon, which is not a lucide one. */
function createCloseIcon() {
  const icon = createSvgElement("svg", {
    xmlns: SVG_NAMESPACE,
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  icon.append(
    createSvgElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    createSvgElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }),
  );

  return icon;
}

/**
 * The shadow root holding the stack, created on the first toast rather than on
 * page load. A Gmail session that never sends a message, and every sign-in page
 * that is not Gmail at all, now builds no DOM here at all.
 */
function getToaster() {
  if (toaster) {
    return toaster;
  }

  const shadowHost = document.createElement("div");

  shadowHost.id = SHADOW_HOST_ID;

  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  const styleElement = document.createElement("style");

  styleElement.textContent = toasterStyles;

  toaster = document.createElement("div");

  toaster.className = "toaster";

  // What sonner was announcing on this stack's behalf. `aria-atomic` is off, as
  // sonner has it, so adding a toast announces that toast rather than re-reading
  // every toast still on screen.
  toaster.setAttribute("role", "status");
  toaster.setAttribute("aria-live", "polite");
  toaster.setAttribute("aria-atomic", "false");
  toaster.setAttribute("aria-label", "Notifications");

  shadowRoot.append(styleElement, toaster);

  document.body.append(shadowHost);

  return toaster;
}

export function showMessageSentToast(browserWindowId: number) {
  // sonner keyed this toast by the compose window's id and updated in place on a
  // repeat. The content never varies, so leaving the toast up is that update.
  if (toasts.has(browserWindowId)) {
    return;
  }

  const toast = document.createElement("div");

  toast.className = "toast";

  const closeButton = document.createElement("button");

  closeButton.type = "button";
  closeButton.className = "toast-close";
  closeButton.setAttribute("aria-label", "Close toast");
  closeButton.append(createCloseIcon());

  closeButton.addEventListener("click", () => {
    dismissMessageSentToast(browserWindowId);
  });

  const icon = document.createElement("div");

  icon.className = "toast-icon";
  icon.append(createSuccessIcon());

  const title = document.createElement("div");

  title.className = "toast-title";
  title.textContent = "Message sent";

  const undoButton = document.createElement("button");

  undoButton.type = "button";
  undoButton.className = "toast-action";
  undoButton.textContent = "Undo";

  // Dismissing here rather than waiting for the main process is what sonner did
  // for an action button, and it has to stay: undoing re-shows the compose
  // window instead of closing it, so nothing sends the dismissal back.
  undoButton.addEventListener("click", () => {
    ipc.main.send("gmail.undoMessageSent", browserWindowId);

    dismissMessageSentToast(browserWindowId);
  });

  toast.append(closeButton, icon, title, undoButton);

  toasts.set(browserWindowId, toast);

  getToaster().append(toast);
}

export function dismissMessageSentToast(browserWindowId: number) {
  const toast = toasts.get(browserWindowId);

  if (!toast) {
    return;
  }

  toasts.delete(browserWindowId);

  toast.classList.add("toast-leaving");

  // A timer rather than `animationend`, which never fires for a toast whose
  // window is hidden while it is leaving, and would leave the element behind.
  setTimeout(() => {
    toast.remove();
  }, LEAVE_ANIMATION_MS);
}
