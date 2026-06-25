export function createElementAttributeFromPreloadArgument(preloadArgument: string) {
  return preloadArgument.replace("--", "data-");
}

export function createNotMatchingAttributeSelector(selector: string, attribute: string) {
  return `${selector}:not([${attribute}])`;
}

export function reEmitClickWithShiftKey(element: Element) {
  let isClicked = false;

  element.addEventListener("click", (event) => {
    if (isClicked) {
      isClicked = false;

      return;
    }

    isClicked = true;

    event.stopPropagation();

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: true,
      }),
    );
  });
}
