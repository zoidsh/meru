import { describe, expect, it } from "vitest";

import { chromeColors } from "../core/engines/chrome.ts";
import { followTheme } from "./theme.ts";
import type { ColorScheme } from "./theme.ts";

type Listener = (event: { readonly matches: boolean }) => void;

class FakeScheme implements ColorScheme {
  matches: boolean;
  readonly #listeners = new Set<Listener>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  readonly addEventListener = (_type: "change", listener: Listener) => {
    this.#listeners.add(listener);
  };

  readonly removeEventListener = (_type: "change", listener: Listener) => {
    this.#listeners.delete(listener);
  };

  readonly change = (matches: boolean) => {
    this.matches = matches;
    for (const listener of this.#listeners) {
      listener({ matches });
    }
  };
}

const page = (url: string, dark: boolean) => {
  const root = document.createElement("html");
  const scheme = new FakeScheme(dark);
  const stop = followTheme(root, url, () => scheme);
  return { root, scheme, stop };
};

describe(followTheme, () => {
  it("paints first as the URL says, then follows the colour scheme", () => {
    const { root, scheme } = page("file:///chrome.html?theme=dark", false);
    expect(root.classList.contains("dark")).toBeTruthy();
    scheme.change(false);
    expect(root.classList.contains("dark")).toBeFalsy();
  });

  it("sets the chrome's ground and ink from the same table the window takes its background from", () => {
    const { root, scheme } = page("file:///chrome.html?theme=light", false);
    const colors = () => [
      root.style.getPropertyValue("--background"),
      root.style.getPropertyValue("--foreground"),
    ];
    const light = colors();
    scheme.change(true);
    expect([light, colors()]).toStrictEqual([
      [chromeColors("light").background, chromeColors("light").foreground],
      [chromeColors("dark").background, chromeColors("dark").foreground],
    ]);
  });

  it("takes the colour scheme when the URL has no theme", () => {
    const { root } = page("file:///chrome.html", true);
    expect(root.classList.contains("dark")).toBeTruthy();
  });

  it("stops following once stopped", () => {
    const { root, scheme, stop } = page(
      "file:///chrome.html?theme=light",
      false
    );
    stop();
    scheme.change(true);
    expect(root.classList.contains("dark")).toBeFalsy();
  });
});
