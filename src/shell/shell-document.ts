import type { ShellDocumentName } from "#core/overlay.ts";

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

const opened = new Map<ShellDocumentName, Document>();

/**
 * A document of a view main shows over the content views, opened once by
 * its name: a blank page of the shell's, in its process, which this tree
 * draws into. Main allows the shell to open these and nothing else.
 */
export const openShellDocument = (name: ShellDocumentName) => {
  const known = opened.get(name);

  if (known) {
    return known;
  }

  const target = window.open("about:blank", name)?.document;

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
  opened.set(name, target);

  return target;
};
