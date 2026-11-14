/** Every element the selector finds that the guard accepts, so a caller holds the element type it asked for without a cast. */
export const queryAll = <E extends Element>(
  root: ParentNode,
  selector: string,
  guard: (element: Element) => element is E
): E[] => {
  const found: E[] = [];
  for (const element of root.querySelectorAll(selector)) {
    if (guard(element)) {
      found.push(element);
    }
  }
  return found;
};

/** The first element the selector finds that the guard accepts, or undefined. */
export const queryOne = <E extends Element>(
  root: ParentNode,
  selector: string,
  guard: (element: Element) => element is E
): E | undefined => {
  for (const element of root.querySelectorAll(selector)) {
    if (guard(element)) {
      return element;
    }
  }
  return undefined;
};

export const isHtmlElement = (value: Element): value is HTMLElement =>
  value instanceof HTMLElement;

export const isAnchorElement = (value: Element): value is HTMLAnchorElement =>
  value instanceof HTMLAnchorElement;
