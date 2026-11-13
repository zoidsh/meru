import { WebContentsView } from "electron";
import type { View } from "electron";

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
    isFocused: () => contents.isFocused(),
    loadURL: async (url) => {
      await contents.loadURL(url);
    },
    onFocus: (listener) => {
      contents.on("focus", listener);
      return () => {
        contents.off("focus", listener);
      };
    },
    onRenderProcessGone: (listener) => {
      const forward = (_event: unknown, details: { reason: string }) => {
        listener(details.reason);
      };
      contents.on("render-process-gone", forward);
      return () => {
        contents.off("render-process-gone", forward);
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
