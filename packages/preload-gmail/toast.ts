/*
 * A toast, built out of DOM calls rather than out of a toast library.
 *
 * The Gmail preload showed exactly one toast — "Message sent", with an Undo
 * action — and reaching it through sonner meant every Gmail renderer loaded
 * react-dom, sonner, lucide and the interface's compiled Tailwind: about 484 KB
 * of a 720 KB preload. It loaded on OAuth and sign-in pages too, since the
 * preload evaluates before the `hostname !== "mail.google.com"` check inside its
 * `DOMContentLoaded` handler.
 *
 * A lazy `import()` would not have helped. Preloads are bundled with
 * `codeSplitting: false` and the Gmail view runs sandboxed, so there is no chunk
 * to fetch at runtime, and rolldown inlines the dynamic import and evaluates it
 * at the top level anyway.
 *
 * The shape is the shadcn Base UI toast — title, muted description, an outline
 * action button and a ghost close button — with fading, an optional timeout and
 * stacking, and nothing else. No swipe, no hover-to-expand, no collapsed stack:
 * every toast in the column stays readable, which a collapsed stack only manages
 * because hovering expands it.
 */
import toastStyles from "./toast.css";

const SHADOW_HOST_ID = "meru-toaster";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Matches the opacity transition in `toast.css`. */
const FADE_MS = 200;

export type ToastOptions = {
  /** Identifies the toast, so it can be replaced or dismissed by its owner. */
  id: number;
  title: string;
  description?: string;
  /** Milliseconds until the toast dismisses itself. Left out, it stays up. */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type Toast = {
  element: HTMLElement;
  dismissTimeout?: ReturnType<typeof setTimeout>;
};

const toasts = new Map<number, Toast>();

let toaster: HTMLElement | undefined;

/** lucide's `x`, at the 16px a `size-4` icon button renders it at. */
function createCloseIcon() {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg");

  for (const [name, value] of Object.entries({
    xmlns: SVG_NAMESPACE,
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    icon.setAttribute(name, value);
  }

  for (const definition of ["M18 6 6 18", "m6 6 12 12"]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");

    path.setAttribute("d", definition);

    icon.append(path);
  }

  return icon;
}

/**
 * The shadow root holding the column, built on the first toast rather than on
 * page load. A Gmail session that sends nothing, and every sign-in page that is
 * not Gmail at all, now builds no DOM here.
 */
function getToaster() {
  if (toaster) {
    return toaster;
  }

  const shadowHost = document.createElement("div");

  shadowHost.id = SHADOW_HOST_ID;

  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  const styleElement = document.createElement("style");

  styleElement.textContent = toastStyles;

  toaster = document.createElement("div");

  toaster.className = "toaster";

  // `aria-atomic` is off so that adding a toast announces that toast, rather
  // than re-reading every toast still on screen.
  toaster.setAttribute("role", "status");
  toaster.setAttribute("aria-live", "polite");
  toaster.setAttribute("aria-atomic", "false");
  toaster.setAttribute("aria-label", "Notifications");

  shadowRoot.append(styleElement, toaster);

  document.body.append(shadowHost);

  return toaster;
}

function createTextElement(className: string, text: string) {
  const element = document.createElement("div");

  element.className = className;
  element.textContent = text;

  return element;
}

export function showToast({ id, title, description, duration, action }: ToastOptions) {
  const replaced = toasts.get(id);

  // Replaced rather than dismissed, so it goes without a fade: fading it would
  // leave the column holding two copies of one notification for as long as the
  // fade lasts, and the second would visibly shove the first.
  if (replaced) {
    clearTimeout(replaced.dismissTimeout);

    replaced.element.remove();
  }

  const element = document.createElement("div");

  element.className = "toast toast-hidden";

  const text = document.createElement("div");

  text.className = "toast-text";
  text.append(createTextElement("toast-title", title));

  if (description) {
    text.append(createTextElement("toast-description", description));
  }

  element.append(text);

  if (action) {
    const actionButton = document.createElement("button");

    actionButton.type = "button";
    actionButton.className = "toast-action";
    actionButton.textContent = action.label;

    actionButton.addEventListener("click", () => {
      action.onClick();

      dismissToast(id);
    });

    element.append(actionButton);
  }

  const closeButton = document.createElement("button");

  closeButton.type = "button";
  closeButton.className = "toast-close";
  closeButton.setAttribute("aria-label", "Close toast");
  closeButton.append(createCloseIcon());

  closeButton.addEventListener("click", () => {
    dismissToast(id);
  });

  element.append(closeButton);

  getToaster().append(element);

  // Two frames: one for the browser to lay the toast out at opacity zero, and
  // one for the change to it to be a transition rather than a starting value.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.classList.remove("toast-hidden");
    });
  });

  toasts.set(id, {
    element,
    dismissTimeout:
      duration === undefined
        ? undefined
        : setTimeout(() => {
            dismissToast(id);
          }, duration),
  });
}

export function dismissToast(id: number) {
  const toast = toasts.get(id);

  if (!toast) {
    return;
  }

  toasts.delete(id);

  clearTimeout(toast.dismissTimeout);

  toast.element.classList.add("toast-hidden");

  // A timer rather than `transitionend`, which never fires for a toast whose
  // view is hidden while it is fading, and would leave the element behind.
  setTimeout(() => {
    toast.element.remove();
  }, FADE_MS);
}
