import { isHtmlElement, queryAll } from "./query.ts";

/** One thing a feature looks for on the page, anchored on a marker Google does not churn: a role, an `aria-label`, a data attribute such as `data-legacy-thread-id` or `data-tooltip`, an icon's path data, or the shape of an `href`. */
export interface SelectorEntry {
  /** What a miss is reported as, so a log line names the entry rather than a selector. */
  readonly id: string;
  readonly anchor: string;
  /** The ancestor of the anchored element the feature wants, when the marker sits on a descendant of it. */
  readonly hop?: string;
  /** While this matches the page the entry must match too, so what the page does not show is told apart from a marker that has rotted. */
  readonly context?: string;
  /** Whether to remember the classes of what the anchor found and look for those first, which Gmail's own styling hangs off; a miss re-detects them from the anchor. */
  readonly cacheClass?: boolean;
}

/** The classes remembered per entry id, owned by whoever runs the entries. */
export type ClassCache = Map<string, string>;

// A class Gmail generates is a short word; anything else is left unremembered rather than escaped, since a remembered class is only ever a shortcut.
const PLAIN_CLASS = /^[A-Za-z][\w-]*$/u;

const classSelectorOf = (element: Element): string | undefined => {
  const classes = [...element.classList].filter((name) =>
    PLAIN_CLASS.test(name)
  );
  return classes.length === 0
    ? undefined
    : classes.map((name) => `.${name}`).join("");
};

const matching = (
  root: ParentNode,
  selector: string,
  hop: string | undefined
): HTMLElement[] => {
  const found = queryAll(root, selector, isHtmlElement);
  if (hop === undefined) {
    return found;
  }
  const hopped: HTMLElement[] = [];
  for (const element of found) {
    const ancestor = element.closest(hop);
    if (
      ancestor !== null &&
      isHtmlElement(ancestor) &&
      !hopped.includes(ancestor)
    ) {
      hopped.push(ancestor);
    }
  }
  return hopped;
};

/** What the entry finds, the remembered classes first and the anchor when those find nothing. */
export const resolveEntry = (
  root: ParentNode,
  entry: SelectorEntry,
  cache: ClassCache
): HTMLElement[] => {
  const remembers = entry.cacheClass === true;
  const remembered = remembers ? cache.get(entry.id) : undefined;
  if (remembered !== undefined) {
    const hit = matching(root, remembered, entry.hop);
    if (hit.length > 0) {
      return hit;
    }
    cache.delete(entry.id);
  }
  const found = matching(root, entry.anchor, entry.hop);
  const [first] = found;
  if (remembers && first !== undefined) {
    const classes = classSelectorOf(first);
    if (classes !== undefined) {
      cache.set(entry.id, classes);
    }
  }
  return found;
};

/** Whether the entry found nothing where it says it must, which the page not showing it is not. */
export const missed = (
  root: ParentNode,
  entry: SelectorEntry,
  found: readonly Element[]
): boolean =>
  found.length === 0 &&
  entry.context !== undefined &&
  root.querySelector(entry.context) !== null;
