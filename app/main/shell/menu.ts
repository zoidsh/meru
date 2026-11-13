import { DisposableStore } from "../../core/disposable.ts";
import { conflicts, resolveBindings } from "../../core/engines/shortcuts.ts";
import type { AppEvents } from "../../core/events.ts";
import type { Command, MenuSectionId } from "../../shared/commands/define.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import { msg } from "../../shared/msg.ts";
import type { SettingsStore } from "../features/settings/index.ts";
import type { MenuEntry, MenuSection } from "../platform/menu.ts";
import type { CommandDispatcher } from "./commands.ts";

const EDIT_ROLES: readonly MenuEntry[] = [
  { kind: "role", role: "undo" },
  { kind: "role", role: "redo" },
  { kind: "separator" },
  { kind: "role", role: "cut" },
  { kind: "role", role: "copy" },
  { kind: "role", role: "paste" },
  { kind: "role", role: "pasteAndMatchStyle" },
  { kind: "role", role: "delete" },
  { kind: "role", role: "selectAll" },
];

const APP_ROLES_BEFORE: readonly MenuEntry[] = [
  { kind: "role", role: "about" },
  { kind: "separator" },
];

const APP_ROLES_AFTER: readonly MenuEntry[] = [
  { kind: "separator" },
  { kind: "role", role: "services" },
  { kind: "separator" },
  { kind: "role", role: "hide" },
  { kind: "role", role: "hideOthers" },
  { kind: "role", role: "unhide" },
  { kind: "separator" },
  { kind: "role", role: "quit" },
];

export interface MenuOptions {
  readonly platform: string;
  readonly commands: readonly Command<CommandId>[];
  readonly bindings: ReadonlyMap<CommandId, string | null>;
  /** Whether a command can run now; the menu shows one that cannot disabled. */
  readonly enabled: (id: CommandId) => boolean;
  readonly run: (id: CommandId, windowId: number) => void;
}

/** The application menu: the platform's own menus, then each section's commands in order, with the resolved shortcuts. */
export const buildMenu = ({
  platform,
  commands,
  bindings,
  enabled,
  run,
}: MenuOptions): MenuSection[] => {
  const actions = (section: MenuSectionId): MenuEntry[] =>
    commands
      .flatMap((command) =>
        command.menu?.section === section
          ? [{ command, order: command.menu.order }]
          : []
      )
      .toSorted((a, b) => a.order - b.order)
      .map(({ command }) => ({
        accelerator: bindings.get(command.id) ?? undefined,
        enabled: enabled(command.id),
        id: command.id,
        kind: "action",
        label: command.label,
        run: (windowId) => {
          // Nothing to act on before a window opens or after the last one closed.
          if (windowId !== undefined) {
            run(command.id, windowId);
          }
        },
      }));
  const edit = actions("edit");
  const app = actions("app");
  const file = actions("file");
  const profiles = actions("profiles");
  const mac = platform === "darwin";
  const first: MenuSection =
    mac && app.length > 0
      ? {
          entries: [...APP_ROLES_BEFORE, ...app, ...APP_ROLES_AFTER],
          kind: "roleSubmenu",
          role: "appMenu",
        }
      : { kind: "role", role: mac ? "appMenu" : "fileMenu" };
  const help: MenuSection[] =
    mac || app.length === 0
      ? []
      : [{ entries: app, kind: "submenu", label: msg`Help` }];
  const fileMenu: MenuSection[] =
    file.length === 0
      ? []
      : [
          {
            entries: [
              ...file,
              { kind: "separator" },
              { kind: "role", role: mac ? "close" : "quit" },
            ],
            kind: "submenu",
            label: msg`File`,
          },
        ];
  const history = actions("history");
  const historyMenu: MenuSection[] =
    history.length === 0
      ? []
      : [{ entries: history, kind: "submenu", label: msg`History` }];
  const profilesMenu: MenuSection[] =
    profiles.length === 0
      ? []
      : [{ entries: profiles, kind: "submenu", label: msg`Profiles` }];
  return [
    ...(mac || file.length === 0 ? [first] : []),
    ...fileMenu,
    edit.length === 0
      ? { kind: "role", role: "editMenu" }
      : {
          entries: [...EDIT_ROLES, { kind: "separator" }, ...edit],
          kind: "submenu",
          label: msg`Edit`,
        },
    { entries: actions("view"), kind: "submenu", label: msg`View` },
    ...historyMenu,
    ...profilesMenu,
    ...help,
  ];
};

export interface ApplicationMenuOptions {
  readonly platform: string;
  readonly commands: readonly Command<CommandId>[];
  readonly dispatcher: Pick<CommandDispatcher, "run" | "enabled">;
  /** Rebuilds the menu when a command's `when` may have changed. */
  readonly events: Pick<AppEvents, "on">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  /** Hands the built menu to Electron. */
  readonly apply: (sections: readonly MenuSection[]) => void;
  readonly report: (message: string) => void;
}

/** Keeps the application menu built from the commands and the user's shortcuts, rebuilding it when the shortcuts change. */
export class ApplicationMenu {
  readonly #options: ApplicationMenuOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: ApplicationMenuOptions) {
    this.#options = options;
  }

  start(): void {
    this.#build();
    this.#disposables.add(
      this.#options.settings.subscribe((changes) => {
        if (changes.some((change) => change.key === "shortcuts.bindings")) {
          this.#build();
        }
      }),
      this.#options.events.on("menu.invalidated", () => {
        this.#build();
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #build(): void {
    const { platform, commands, dispatcher, settings, apply, report } =
      this.#options;
    const bindings = resolveBindings(
      commands,
      settings.get("shortcuts.bindings"),
      platform
    );
    for (const conflict of conflicts(bindings, platform)) {
      report(`${conflict.ids.join(" and ")} share ${conflict.accelerator}`);
    }
    apply(
      buildMenu({
        bindings,
        commands,
        enabled: (id) => dispatcher.enabled(id),
        platform,
        run: (id, windowId) => {
          const result = dispatcher.run(id, { windowId });
          if (!result.ok) {
            report(`${id}: ${result.error}`);
          }
        },
      })
    );
  }
}
