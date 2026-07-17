// Stamped on every <style> the engine injects so its own output is never
// re-walked or fingerprinted as page CSS — that would feed the darkened values
// back into the next build and defeat the rule caches.
export const INJECTED_STYLE_ATTRIBUTE = "data-dark-theme-style";
