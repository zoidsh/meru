import { WebContentsView } from "electron";
import type { HandlerDetails, View } from "electron";

import type {
  OpenListener,
  ViewFactoryPort,
  ViewPort,
  ViewSpec,
} from "../../core/ports.ts";
import type { Disposition } from "../../core/records/link.ts";
import { onBeforeInput } from "./keys.ts";

const handles = new WeakMap<ViewPort, WebContentsView>();
const ports = new WeakMap<View, ViewPort>();

export const handleOf = (view: ViewPort): WebContentsView => {
  const handle = handles.get(view);
  if (handle === undefined) {
    throw new Error("A view the view factory did not make reached a window");
  }
  return handle;
};

export const portOf = (view: View): ViewPort | undefined => ports.get(view);

// The dispositions 3.x's window-open handler told apart: a new window and a background tab; Chromium's foreground tab and the rest open as an ordinary click would.
const dispositionOf = (
  disposition: HandlerDetails["disposition"]
): Disposition => {
  if (disposition === "new-window") {
    return "window";
  }
  return disposition === "background-tab" ? "background" : "default";
};

const createView = (spec: ViewSpec): ViewPort => {
  const view = new WebContentsView({
    webPreferences: {
      additionalArguments: [...(spec.arguments ?? [])],
      contextIsolation: true,
      nodeIntegration: false,
      partition: spec.partition,
      preload: spec.preload,
      sandbox: true,
      zoomFactor: spec.zoom,
    },
  });
  view.setBorderRadius(spec.radius);
  view.setBackgroundColor(spec.background);
  const contents = view.webContents;
  const openers = new Set<OpenListener>();
  const taken = (url: string, disposition: Disposition) =>
    [...openers].some((listener) => listener(url, disposition));
  // Electron keeps one window-open handler per web contents, so the view installs it once and fans each link out to its listeners.
  contents.setWindowOpenHandler(({ url, disposition }) =>
    taken(url, dispositionOf(disposition))
      ? { action: "deny" }
      : { action: "allow" }
  );
  contents.on("will-navigate", (event) => {
    if (taken(event.url, "inPlace")) {
      event.preventDefault();
    }
  });

  const port: ViewPort = {
    bounds: () => view.getBounds(),
    contentsId: contents.id,
    destroy: () => {
      if (!contents.isDestroyed()) {
        contents.close();
      }
    },
    focus: () => {
      contents.focus();
    },
    loadURL: async (url) => {
      await contents.loadURL(url);
    },
    navigate: (action) => {
      if (action === "back") {
        contents.navigationHistory.goBack();
      } else if (action === "forward") {
        contents.navigationHistory.goForward();
      } else if (action === "reload") {
        contents.reload();
      } else {
        contents.stop();
      }
    },
    navigation: () => ({
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      loading: contents.isLoading(),
    }),
    onKey: (listener) => onBeforeInput(contents, listener),
    onFocus: (listener) => {
      contents.on("focus", listener);
      return () => {
        contents.off("focus", listener);
      };
    },
    onNavigation: (listener) => {
      const changed = () => {
        listener();
      };
      contents.on("did-start-loading", changed);
      contents.on("did-stop-loading", changed);
      contents.on("did-navigate", changed);
      contents.on("did-navigate-in-page", changed);
      return () => {
        contents.off("did-start-loading", changed);
        contents.off("did-stop-loading", changed);
        contents.off("did-navigate", changed);
        contents.off("did-navigate-in-page", changed);
      };
    },
    onOpen: (listener) => {
      openers.add(listener);
      return () => {
        openers.delete(listener);
      };
    },
    setBorderRadius: (radius) => {
      view.setBorderRadius(radius);
    },
    setBounds: (rect) => {
      view.setBounds(rect);
    },
    setZoomFactor: (factor) => {
      contents.setZoomFactor(factor);
    },
    zoomFactor: () => contents.getZoomFactor(),
  };
  handles.set(port, view);
  ports.set(view, port);
  return port;
};

export const viewFactory: ViewFactoryPort = { create: createView };
