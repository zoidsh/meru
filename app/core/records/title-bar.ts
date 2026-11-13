export interface TitleBarOverlay {
  readonly color: string;
  readonly symbolColor: string;
  readonly height: number;
}

export interface TitleBar {
  readonly style: "hiddenInset" | "hidden";
  readonly trafficLights: { readonly x: number; readonly y: number } | null;
  /** The window controls drawn over the page, which also tells the page where they are through `env(titlebar-area-*)`; null where the platform draws none. On macOS only the height counts. */
  readonly overlay: TitleBarOverlay | null;
}
