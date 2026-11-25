import { OVERLAY_FRAME_NAME } from "#core/overlay.ts";

const STYLESHEETS = 'style, link[rel="stylesheet"]';

/**
 * Gives one of the shell's documents its styles, again whenever they
 * change; returns what stops it, which lets the document go.
 */
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
  const observer = new MutationObserver(copy);

  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return () => {
    observer.disconnect();
  };
};

/** A window of the shell's documents, as the registry below needs it. */
export interface DocumentWindow {
  readonly closed: boolean;
  close: () => void;
}

/**
 * The shell's open documents by name, each with what stops what was set up
 * for it, run as it is closed or goes by itself, so nothing of the shell's
 * keeps a closed document alive. `open` opens one and sets it up, telling
 * `gone` should it go by itself; `undefined` when it cannot be opened.
 */
export const createShellDocuments = <View extends DocumentWindow>(
  open: (
    name: string,
    gone: () => void
  ) => { view: View; stop: () => void } | undefined
) => {
  const opened = new Map<string, { view: View; stop: () => void }>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const forget = (name: string) => {
    const entry = opened.get(name);

    if (entry) {
      opened.delete(name);
      entry.stop();
    }
  };

  const live = (name: string) => {
    const entry = opened.get(name);

    if (entry?.view.closed) {
      forget(name);

      return;
    }

    return entry?.view;
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    get: live,
    open: (name: string) => {
      const existing = live(name);

      if (existing) {
        return existing;
      }

      const entry = open(name, () => {
        if (opened.get(name) === entry) {
          forget(name);
          notify();
        }
      });

      if (!entry) {
        return;
      }

      opened.set(name, entry);
      notify();

      return entry.view;
    },
    close: (name: string) => {
      const entry = opened.get(name);

      forget(name);
      entry?.view.close();
      notify();
    },
  };
};

const documents = createShellDocuments((name, gone) => {
  const view = window.open("about:blank", name);
  const target = view?.document;

  if (!view || !target) {
    return;
  }

  Object.assign(
    target.documentElement.dataset,
    document.documentElement.dataset
  );

  const stopStyles = mirrorStyles(target);
  const copyLanguage = () => {
    target.documentElement.lang = document.documentElement.lang;
  };
  const language = new MutationObserver(copyLanguage);

  copyLanguage();
  language.observe(document.documentElement, { attributeFilter: ["lang"] });

  // Clear wherever nothing is drawn, so the page shows through.
  target.body.className = "bg-transparent";
  // Main closes its view as its window or the shell's renderer goes.
  view.addEventListener("pagehide", gone, { once: true });

  return {
    view,
    stop: () => {
      stopStyles();
      language.disconnect();
    },
  };
});

/** Told as a document is opened or closed; returns what stops it. */
export const subscribeShellDocuments = documents.subscribe;

/** The document under `name`, while it is open. */
export const shellDocument = (name: string) => documents.get(name)?.document;

/**
 * A document of the shell's own under `name`, opened once and again only
 * once it has been closed: a blank page of the shell's, in its process,
 * which this tree draws into, and main shows in a view of its own. Main
 * allows the shell to open these and nothing else.
 */
export const openShellDocument = (name: string) =>
  documents.open(name)?.document;

/** Closes the document under `name`, which main's view goes with. */
export const closeShellDocument = documents.close;

/**
 * The overlay's document, of the view main shows over the content views,
 * which holds the menus, the cards, the find bar and the toasts.
 */
export const openOverlayDocument = () => openShellDocument(OVERLAY_FRAME_NAME);
