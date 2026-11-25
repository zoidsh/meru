import type { SettingsState } from "#contract/settings.ts";
import type { Platform } from "#core/platform.ts";
import type { LoginItem } from "#platform/login-item.ts";

export interface GeneralPageDeps {
  platform: Platform;
  loginItem: LoginItem;
}

/**
 * What the General page shows that is not a setting: the system's login
 * item, which Linux has none of here, as in v3.
 */
export const createGeneralPage = ({ platform, loginItem }: GeneralPageDeps) => {
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    read: (): SettingsState["general"] => ({
      openAtLogin:
        platform === "linux"
          ? null
          : { on: loginItem.isOn(), real: loginItem.real },
    }),
    setOpenAtLogin: (on: boolean) => {
      if (platform === "linux") {
        throw new Error("Meru has no login item on Linux");
      }

      loginItem.set(on);
      notify();
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type GeneralPage = ReturnType<typeof createGeneralPage>;
