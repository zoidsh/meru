import { DisposableStore } from "../../../core/disposable.ts";
import { badgeText } from "../../../core/engines/badge.ts";
import type { AppEvents } from "../../../core/events.ts";
import type {
  ThemePort,
  Unsubscribe,
  TrayIcon,
  TrayItem,
  TrayPort,
} from "../../../core/ports.ts";
import type { Platform } from "../../../core/records/platform.ts";
import { msg } from "../../../shared/msg.ts";
import type { Inbox } from "../inbox/index.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";

export interface TrayOptions {
  readonly tray: TrayPort;
  readonly platform: Platform;
  readonly theme: ThemePort;
  readonly inbox: Pick<Inbox, "unread" | "total">;
  readonly profiles: Pick<
    Profiles,
    "state" | "isDeactivated" | "selectProfile"
  >;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly events: Pick<AppEvents, "on">;
  /** The main window, which the icon shows and hides. */
  readonly window: {
    readonly visible: () => boolean;
    readonly reveal: () => void;
    readonly hide: () => void;
    readonly onVisibilityChanged: (listener: () => void) => Unsubscribe;
  };
}

// Each platform's own word for quitting from a tray, as 3.x has them.
const QUIT_LABELS: Readonly<Record<Platform, string>> = {
  darwin: msg`Quit Meru`,
  linux: msg`Quit`,
  win32: msg`Exit`,
};

const TRAY_KEYS = new Set([
  "tray.icon",
  "tray.unreadCount",
  "tray.iconColor",
  "inbox.countUnread",
]);

/** The icon in the menu bar or system tray: the unread count, a menu of the profiles, and a click that shows or hides the window. */
export class Tray {
  readonly #options: TrayOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: TrayOptions) {
    this.#options = options;
  }

  start(): void {
    const { events, settings, theme, tray, window } = this.#options;
    this.#disposables.add(
      events.on("inbox.changed", () => {
        this.#render();
      }),
      events.on("stage.invalidated", () => {
        this.#render();
      }),
      settings.subscribe((changes) => {
        if (changes.some((change) => TRAY_KEYS.has(change.key))) {
          this.#render();
        }
      }),
      theme.onChange(() => {
        this.#render();
      }),
      window.onVisibilityChanged(() => {
        this.#render();
      }),
      () => {
        tray.hide();
      }
    );
    this.#render();
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #render(): void {
    const { inbox, platform, settings, tray } = this.#options;
    if (!settings.get("tray.icon")) {
      tray.hide();
      return;
    }
    const total = inbox.total();
    tray.show(
      {
        icon: this.#icon(total > 0),
        menu: this.#menu(),
        title:
          platform === "darwin" && settings.get("tray.unreadCount")
            ? badgeText(total)
            : "",
      },
      () => {
        this.#toggle();
      }
    );
  }

  #icon(unread: boolean): TrayIcon {
    const { platform, settings, theme } = this.#options;
    if (platform === "darwin") {
      return { kind: "template" };
    }
    const color = settings.get("tray.iconColor");
    if (color !== "system") {
      return { kind: "tray", shade: color, unread };
    }
    // A light icon on a dark tray, and the other way round.
    return { kind: "tray", shade: theme.dark() ? "light" : "dark", unread };
  }

  #menu(): readonly TrayItem[] {
    const { inbox, platform, profiles, window } = this.#options;
    const visible = window.visible();
    return [
      ...profiles.state.profiles
        .filter((profile) => !profiles.isDeactivated(profile.id))
        .map((profile): TrayItem => {
          const unread = inbox.unread(profile.id);
          return {
            kind: "item",
            label: unread > 0 ? `${profile.label} (${unread})` : profile.label,
            run: () => {
              profiles.selectProfile(profile.id);
              window.reveal();
            },
          };
        }),
      { kind: "separator" },
      {
        kind: "item",
        label: visible ? msg`Hide Meru` : msg`Show Meru`,
        run: () => {
          if (visible) {
            window.hide();
          } else {
            window.reveal();
          }
        },
      },
      { kind: "separator" },
      { kind: "quit", label: QUIT_LABELS[platform] },
    ];
  }

  #toggle(): void {
    const { inbox, profiles, settings, window } = this.#options;
    if (window.visible()) {
      window.hide();
      return;
    }
    if (settings.get("tray.selectUnread")) {
      const first = profiles.state.profiles.find(
        (profile) =>
          !profiles.isDeactivated(profile.id) && inbox.unread(profile.id) > 0
      );
      if (first !== undefined) {
        profiles.selectProfile(first.id);
      }
    }
    window.reveal();
  }
}
