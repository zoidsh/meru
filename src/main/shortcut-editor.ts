import { isRecordable } from "#core/accelerator.ts";
import type { PressedKey } from "#core/accelerator.ts";
import type { Capability } from "#core/entitlement.ts";
import type { Platform } from "#core/platform.ts";
import type { AppWindow } from "#platform/window.ts";

import type { KeymapService } from "./keymap.ts";

export interface ShortcutEditorDeps {
  platform: Platform;
  keymap: Pick<KeymapService, "isChangeable" | "set" | "reset">;
  can: (capability: Capability) => boolean;
  /**
   * Whether the Settings window's page keeps the menu's keys from acting,
   * so a key typed into the recorder closes, quits or hides nothing.
   */
  ignoreMenuShortcuts: (ignore: boolean) => void;
}

/**
 * The Shortcuts page's recorder: which command's key is being typed, which
 * main holds so the menu hears no key meanwhile, and the changes the page
 * asks for. Recording ends with any change, and when the Settings window
 * loses the keys, hides, closes or its page goes.
 */
export const createShortcutEditor = ({
  platform,
  keymap,
  can,
  ignoreMenuShortcuts,
}: ShortcutEditorDeps) => {
  let recording: string | null = null;
  const listeners = new Set<() => void>();

  const record = (id: string | null) => {
    if (recording === id) {
      return;
    }

    recording = id;
    ignoreMenuShortcuts(id !== null);

    for (const listener of listeners) {
      listener();
    }
  };

  const stop = () => {
    record(null);
  };

  return {
    /** The command whose key is being typed, if any. */
    recording: () => recording,
    /** Starts recording the command's key, or with `null` stops. */
    record: (id: string | null) => {
      if (
        id !== null &&
        (!can("shortcutCustomization") || !keymap.isChangeable(id))
      ) {
        throw new Error(`Command ${id} has no key to record`);
      }

      record(id);
    },
    /**
     * Gives the command the key typed, `""` for none; answers why not when
     * another holds it, or hears the key `pressed` that recorded it.
     */
    set: (id: string, accelerator: string, pressed?: PressedKey) => {
      stop();

      if (
        accelerator !== "" &&
        !isRecordable(accelerator, platform === "darwin")
      ) {
        return Promise.reject(
          new Error(`${accelerator} is no key the recorder gives`)
        );
      }

      return keymap.set(id, accelerator, pressed);
    },
    reset: (id: string) => {
      stop();

      return keymap.reset(id);
    },
    /** Ends recording whenever the window stops taking the keys typed. */
    follow: (
      window: Pick<AppWindow, "on" | "onClosed" | "onPageGone" | "isVisible">
    ) => {
      window.on("blur", stop);
      // Electron on macOS also says hide when other windows cover this one,
      // which leaves it visible and, when it has the keys, recording.
      window.on("hide", () => {
        if (!window.isVisible()) {
          stop();
        }
      });
      window.onClosed(stop);
      window.onPageGone(stop);
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type ShortcutEditor = ReturnType<typeof createShortcutEditor>;
