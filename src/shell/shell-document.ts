import { OVERLAY_FRAME_NAME } from "#core/overlay.ts";

const STYLESHEETS = 'style, link[rel="stylesheet"]';

/** Gives one of the shell's documents its styles, again whenever they change. */
const mirrorStyles = (target: Document) => {
  const copy = () => {
    for (const node of target.head.querySelectorAll(STYLESHEETS)) {
      node.remove();
    }

    for (const node of document.head.querySelectorAll(STYLESHEETS)) {
      // A clone keeps the nonce the dev server's CSP asks of its styles.
      target.head.append(node.cloneNode(true));
    }
  };

  copy();
  // The dev server adds and rewrites styles as their sources change.
  new MutationObserver(copy).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

const opened = new Map<string, Window>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

/** Told as a document is opened or closed; returns what stops it. */
export const subscribeShellDocuments = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** The document under `name`, while it is open. */
export const shellDocument = (name: string) => {
  const open = opened.get(name);

  return open && !open.closed ? open.document : undefined;
};

/**
 * A document of the shell's own under `name`, opened once and again only
 * once it has been closed: a blank page of the shell's, in its process,
 * which this tree draws into, and main shows in a view of its own. Main
 * allows the shell to open these and nothing else.
 */
export const openShellDocument = (name: string) => {
  const open = opened.get(name);

  if (open && !open.closed) {
    return open.document;
  }

  const view = window.open("about:blank", name);
  const target = view?.document;

  if (!view || !target) {
    return;
  }

  target.documentElement.lang = document.documentElement.lang;
  Object.assign(
    target.documentElement.dataset,
    document.documentElement.dataset
  );
  mirrorStyles(target);
  // Clear wherever nothing is drawn, so the page shows through.
  target.body.className = "bg-transparent";
  opened.set(name, view);
  notify();

  return target;
};

/** Closes the document under `name`, which main's view goes with. */
export const closeShellDocument = (name: string) => {
  opened.get(name)?.close();
  opened.delete(name);
  notify();
};

/**
 * The overlay's document, of the view main shows over the content views,
 * which holds the menus, the cards, the find bar and the toasts.
 */
export const openOverlayDocument = () => openShellDocument(OVERLAY_FRAME_NAME);
