import { afterEach, describe, expect, it, vi } from "vitest";

import { isHtmlElement, queryOne } from "../../content/query.ts";
import { mountGmail } from "../testing.ts";
import links from "./fixtures/links.html?raw";
import { urlPreview } from "./url-preview.ts";

const preview = () =>
  queryOne(document, ".meru-url-preview", isHtmlElement) ?? undefined;

const hover = (selector: string, type: "mouseover" | "mouseout") => {
  const link = queryOne(document, selector, isHtmlElement);
  link?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
};

const outside = 'a[href^="https://example.com"] span';
const inside = 'a[href^="https://mail.google.com"]';

describe(urlPreview.id, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows where an outside link goes, widens on a long hover and goes on the way out", () => {
    vi.useFakeTimers();
    const page = mountGmail({ features: [urlPreview], html: links });

    hover(outside, "mouseover");
    expect(preview()?.textContent).toBe(
      "https://example.com/a-very-long-path-to-somewhere-else"
    );
    expect(preview()?.dataset.longHover).toBeUndefined();

    vi.advanceTimersByTime(1500);
    expect(preview()?.dataset.longHover).toBe("true");

    hover(outside, "mouseout");
    expect(preview()?.dataset.fadeOut).toBe("true");

    preview()?.dispatchEvent(new Event("animationend"));
    expect(preview()).toBeUndefined();
    page.app.dispose();
  });

  it("says nothing of a link within the mailbox", () => {
    vi.useFakeTimers();
    const page = mountGmail({ features: [urlPreview], html: links });

    expect(page.sheet("urlPreview")).toContain("meru-url-preview-in");
    hover(inside, "mouseover");

    expect(preview()).toBeUndefined();
    page.app.dispose();
  });

  it("takes its listeners and what it drew with it", () => {
    vi.useFakeTimers();
    const page = mountGmail({ features: [urlPreview], html: links });

    hover(outside, "mouseover");
    page.app.dispose();
    expect(preview()).toBeUndefined();

    hover(outside, "mouseover");
    expect(preview()).toBeUndefined();
  });
});
