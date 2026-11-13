import { WebContentsView } from "electron";
import type { Input, View } from "electron";

import type { ViewFactoryPort, ViewPort, ViewSpec } from "../../core/ports.ts";

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

const createView = (spec: ViewSpec): ViewPort => {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: spec.partition,
      preload: spec.preload,
      sandbox: true,
      zoomFactor: spec.zoom,
    },
  });
  view.setBorderRadius(spec.radius);
  const contents = view.webContents;

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
    onKey: (listener) => {
      const heard = (event: { preventDefault: () => void }, input: Input) => {
        if (listener(input)) {
          event.preventDefault();
        }
      };
      contents.on("before-input-event", heard);
      return () => {
        contents.off("before-input-event", heard);
      };
    },
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
    setBackgroundColor: (color) => {
      view.setBackgroundColor(color);
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
