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

let opened: Document | undefined;

/**
 * The overlay's document, of the view main shows over the content views,
 * opened once: a blank page of the shell's, in its process, which this tree
 * draws into. Main allows the shell to open it and nothing else.
 */
export const openOverlayDocument = () => {
  if (opened) {
    return opened;
  }

  const target = window.open("about:blank", OVERLAY_FRAME_NAME)?.document;

  if (!target) {
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
  opened = target;

  return target;
};
