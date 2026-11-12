/**
 * The seams between Meru and Electron. `main/platform` implements them over Electron, `test/fakes` by hand; nothing else knows which one it has.
 */

/** Makes a new opaque id; the fake counts, so a test's ids are deterministic. */
export type Ids = () => string;

export interface Clock {
  readonly now: () => number;
}

export interface AppPort {
  readonly platform: string;
  readonly whenReady: () => Promise<void>;
  readonly onWindowAllClosed: (listener: () => void) => () => void;
  readonly quit: () => void;
  /** Keeps the app from ever coming to the front, for a run nobody watches; macOS only. */
  readonly prohibitActivation: () => void;
}

export interface WindowSpec {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Absolute path of the built preload the window's page runs with. */
  readonly preload: string;
}

export interface WindowPort {
  readonly loadUrl: (url: string) => Promise<void>;
  readonly loadFile: (path: string) => Promise<void>;
  readonly show: () => void;
  /** Shows the window without activating the app, so it opens behind whatever is in front. */
  readonly showInactive: () => void;
  readonly onClosed: (listener: () => void) => () => void;
}

export interface Ports {
  readonly app: AppPort;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly createWindow: (spec: WindowSpec) => WindowPort;
}
