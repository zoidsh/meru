/// <reference lib="dom" />

export function observeBodyMutations(callback: () => void) {
  const observer = new MutationObserver(() => {
    callback();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
