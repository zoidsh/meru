import { describe, expect, it } from "vitest";

import type { State } from "#core/state.ts";
import type { Size } from "#core/window-bounds.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import type { ContentViewOptions } from "#platform/content-view.ts";

import { createProfileViews } from "./profile-views.ts";
import type { ProfileViewsDeps } from "./profile-views.ts";
import { createSenderRegistry } from "./senders.ts";

const state = (selectedProfileId: string, ids = ["a", "b"]): State => ({
  version: 1,
  profiles: ids.map((id) => ({ id, name: id })),
  selectedProfileId,
});

interface FakeView {
  partition: string;
  options: ContentViewOptions;
  bounds: unknown[];
  loaded: string[];
  visible: boolean | undefined;
  closed: boolean;
}

const setup = ({ load = Promise.resolve() } = {}) => {
  let size: Size = { width: 1280, height: 800 };
  let resize: (() => void) | undefined;
  const views: FakeView[] = [];
  const opened: string[] = [];
  const logs: string[] = [];
  const senders = createSenderRegistry();
  let webContentsIds = 10;

  const window: ProfileViewsDeps["window"] = {
    getContentAreaSize: () => size,
    onContentAreaResize: (listener) => {
      resize = listener;
    },
    addContentView: (options) => {
      const view: FakeView = {
        partition: options.partition,
        options,
        bounds: [],
        loaded: [],
        visible: undefined,
        closed: false,
      };

      views.push(view);
      webContentsIds += 1;
      options.onWebContents(webContentsIds, "content-view");

      return {
        setBounds: (rectangle) => view.bounds.push(rectangle),
        loadURL: (url) => {
          view.loaded.push(url);

          return load;
        },
        setVisible: (visible) => {
          view.visible = visible;
        },
        close: () => {
          view.closed = true;
        },
      };
    },
  };

  const manager = createProfileViews({
    window,
    url: "https://mail.google.com/mail/u/0",
    childWindowOrigins: SIGN_IN_ORIGINS,
    background: true,
    systemBrowser: {
      open: (url) => {
        opened.push(url);

        return Promise.reject(new Error("no browser"));
      },
    },
    senders,
    log: (message) => logs.push(message),
  });

  return {
    manager,
    views,
    opened,
    logs,
    senders,
    live: () =>
      views
        .filter((view) => !view.closed)
        .map((view) => [view.partition, view.visible]),
    resizeTo: (next: Size) => {
      size = next;
      resize?.();
    },
  };
};

describe(createProfileViews, () => {
  it("creates only the selected profile's view, loading Gmail in its session below the titlebar", () => {
    const window = setup();

    window.manager.reconcile(state("a"));

    expect(window.live()).toStrictEqual([["persist:a", true]]);
    expect(window.views[0]?.loaded).toStrictEqual([
      "https://mail.google.com/mail/u/0",
    ]);
    expect(window.views[0]?.bounds).toStrictEqual([
      { x: 0, y: 40, width: 1280, height: 760 },
    ]);
  });

  it("registers the view's webContents with its profile", () => {
    const window = setup();

    window.manager.reconcile(state("b"));

    expect(window.senders.identify(11)).toStrictEqual({
      role: "content-view",
      profileId: "b",
    });
  });

  it("hides a view when another profile is selected and keeps it loaded", () => {
    const window = setup();

    window.manager.reconcile(state("a"));
    window.manager.reconcile(state("b"));
    window.manager.reconcile(state("a"));

    expect(window.live()).toStrictEqual([
      ["persist:a", true],
      ["persist:b", false],
    ]);
    expect(window.views.map((view) => view.loaded.length)).toStrictEqual([
      1, 1,
    ]);
  });

  it("closes the view of a removed profile", () => {
    const window = setup();

    window.manager.reconcile(state("a"));
    window.manager.reconcile(state("b"));
    window.manager.reconcile(state("a", ["a"]));

    expect(window.live()).toStrictEqual([["persist:a", true]]);
  });

  it("moves every view, hidden ones too, when the content area resizes", () => {
    const window = setup();

    window.manager.reconcile(state("a"));
    window.manager.reconcile(state("b"));
    window.resizeTo({ width: 900, height: 600 });

    for (const view of window.views) {
      expect(view.bounds.at(-1)).toStrictEqual({
        x: 0,
        y: 40,
        width: 900,
        height: 560,
      });
    }
  });

  it("opens sign-in as a child window, other links in the system browser, and refuses the rest", async () => {
    const window = setup();

    window.manager.reconcile(state("a"));

    const { onWindowOpen } = window.views[0]?.options ?? {};

    expect(onWindowOpen?.("https://accounts.google.com/signin")).toBe("allow");
    expect(onWindowOpen?.("https://example.com/")).toBe("deny");
    expect(onWindowOpen?.("file:///etc/passwd")).toBe("deny");
    expect(window.opened).toStrictEqual(["https://example.com/"]);

    // The system browser failing is logged, not thrown.
    await Promise.resolve();
    expect(window.logs).toHaveLength(1);
  });

  it("logs a load that fails rather than rejecting", async () => {
    const window = setup({
      load: Promise.reject(new Error("ERR_INTERNET_DISCONNECTED (-106)")),
    });

    window.manager.reconcile(state("a"));
    await Promise.resolve();
    await Promise.resolve();

    expect(window.logs).toStrictEqual([
      "Gmail did not load: ERR_INTERNET_DISCONNECTED (-106)",
    ]);
  });
});
