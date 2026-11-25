import { app } from "electron";

/** Whether the system opens Meru as the person logs in. */
export interface LoginItem {
  /** `false` where it only pretends, as every build but a release's does. */
  readonly real: boolean;
  isOn: () => boolean;
  set: (on: boolean) => void;
}

/**
 * Windows' portable build runs from a copy it extracts to the temporary
 * folder, gone by the next login, so its Run key entry names the portable
 * file itself. Reading asks with the same path, or it reads another entry.
 */
const entry = () => {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;

  return portable ? { path: portable } : {};
};

/** The system's own: Login Items on macOS, the Run key on Windows. */
export const createLoginItem = (): LoginItem => ({
  real: true,
  isOn: () => app.getLoginItemSettings(entry()).openAtLogin,
  set: (on) => {
    app.setLoginItemSettings({ ...entry(), openAtLogin: on });
  },
});

/**
 * A development build's, held for the run alone, so Meru Dev never opens at
 * login nor takes the place of an installed Meru's login item.
 */
export const createHeldLoginItem = (): LoginItem => {
  let on = false;

  return {
    real: false,
    isOn: () => on,
    set: (next) => {
      on = next;
    },
  };
};

/** Each value the end-to-end build was asked to set, in order. */
export interface CapturedLoginItem {
  calls: boolean[];
}

/**
 * The end-to-end build's: held as a development build's, each call recorded
 * on the main process's global under `meruTestLoginItem`.
 */
export const createCapturedLoginItem = (): LoginItem => {
  const captured: CapturedLoginItem = { calls: [] };
  const held = createHeldLoginItem();

  Reflect.set(globalThis, "meruTestLoginItem", captured);

  return {
    ...held,
    set: (on) => {
      captured.calls.push(on);
      held.set(on);
    },
  };
};
