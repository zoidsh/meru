import { describe, expect, it } from "vitest";

import type { Rectangle, Size } from "#core/window-bounds.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import type { ContentViewOptions } from "#platform/content-view.ts";

import { createGmailView } from "./gmail-view.ts";
import type { GmailViewDeps } from "./gmail-view.ts";

const setup = ({ load = Promise.resolve() } = {}) => {
  let size: Size = { width: 1280, height: 800 };
  let resize: (() => void) | undefined;
  let options: ContentViewOptions | undefined;
  const bounds: Rectangle[] = [];
  const loaded: string[] = [];
  const opened: string[] = [];
  const logs: string[] = [];

  const window: GmailViewDeps["window"] = {
    getContentSize: () => size,
    onResize: (listener) => {
      resize = listener;
    },
    addContentView: (contentViewOptions) => {
      options = contentViewOptions;

      return {
        setBounds: (rectangle) => bounds.push(rectangle),
        loadURL: (url) => {
          loaded.push(url);

          return load;
        },
      };
    },
  };

  createGmailView({
    window,
    partition: "persist:f00d",
    url: "https://mail.google.com/mail/u/0",
    childWindowOrigins: SIGN_IN_ORIGINS,
    background: true,
    systemBrowser: {
      open: (url) => {
        opened.push(url);

        return Promise.reject(new Error("no browser"));
      },
    },
    log: (message) => logs.push(message),
  });

  return {
    bounds,
    loaded,
    opened,
    logs,
    options: () => {
      if (!options) {
        throw new Error("No view was added");
      }

      return options;
    },
    resizeTo: (next: Size) => {
      size = next;
      resize?.();
    },
  };
};

describe(createGmailView, () => {
  it("loads Gmail in the profile's session below the titlebar", () => {
    const view = setup();

    expect(view.options().partition).toBe("persist:f00d");
    expect(view.loaded).toStrictEqual(["https://mail.google.com/mail/u/0"]);
    expect(view.bounds).toStrictEqual([
      { x: 0, y: 40, width: 1280, height: 760 },
    ]);
  });

  it("follows the window when it resizes", () => {
    const view = setup();

    view.resizeTo({ width: 900, height: 600 });

    expect(view.bounds.at(-1)).toStrictEqual({
      x: 0,
      y: 40,
      width: 900,
      height: 560,
    });
  });

  it("opens sign-in as a child window, other links in the system browser, and refuses the rest", async () => {
    const view = setup();
    const { onWindowOpen } = view.options();

    expect(onWindowOpen("https://accounts.google.com/signin")).toBe("allow");
    expect(onWindowOpen("https://example.com/")).toBe("deny");
    expect(onWindowOpen("file:///etc/passwd")).toBe("deny");
    expect(view.opened).toStrictEqual(["https://example.com/"]);

    // The system browser failing is logged, not thrown.
    await Promise.resolve();
    expect(view.logs).toHaveLength(1);
  });

  it("logs a load that fails rather than rejecting", async () => {
    const view = setup({
      load: Promise.reject(new Error("ERR_INTERNET_DISCONNECTED (-106)")),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(view.logs).toStrictEqual([
      "Gmail did not load: ERR_INTERNET_DISCONNECTED (-106)",
    ]);
  });
});
