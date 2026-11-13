import { describe, expect, it } from "vitest";

import { chromeColors } from "../core/engines/chrome.ts";
import type { Theme } from "../core/records/theme.ts";
import { followTheme } from "./theme.ts";

const page = (url: string) => {
  const root = document.createElement("html");
  const listeners = new Set<(theme: Theme) => void>();
  const stop = followTheme(root, url, (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const change = (theme: Theme) => {
    for (const listener of listeners) {
      listener(theme);
    }
  };
  return { change, root, stop };
};

describe(followTheme, () => {
  it("paints first as the URL says, then as main reports", () => {
    const { root, change } = page("file:///chrome.html?theme=dark");
    expect(root.classList.contains("dark")).toBeTruthy();
    change("light");
    expect(root.classList.contains("dark")).toBeFalsy();
  });

  it("sets the chrome's ground and ink from the same table the window takes its background from", () => {
    const { root, change } = page("file:///chrome.html?theme=light");
    const colors = () => [
      root.style.getPropertyValue("--background"),
      root.style.getPropertyValue("--foreground"),
    ];
    const light = colors();
    change("dark");
    expect([light, colors()]).toStrictEqual([
      [chromeColors("light").background, chromeColors("light").foreground],
      [chromeColors("dark").background, chromeColors("dark").foreground],
    ]);
  });

  it("paints light when the URL has no theme", () => {
    const { root } = page("file:///chrome.html");
    expect(root.classList.contains("dark")).toBeFalsy();
  });

  it("stops following once stopped", () => {
    const { root, change, stop } = page("file:///chrome.html?theme=light");
    stop();
    change("dark");
    expect(root.classList.contains("dark")).toBeFalsy();
  });
});
