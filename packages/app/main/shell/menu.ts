import { conflicts, resolveBindings } from "../../core/engines/shortcuts.ts";
import type { Unsubscribe } from "../../core/ports.ts";
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

export interface MenuOptions {
  readonly platform: string;
  readonly commands: readonly Command<CommandId>[];
  readonly bindings: ReadonlyMap<CommandId, string | null>;
  readonly run: (id: CommandId, windowId: number) => void;
}

/** The application menu: the platform's own menus, then each section's commands in order, with the resolved shortcuts. */
export const buildMenu = ({
  platform,
  commands,
  bindings,
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
  return [
    platform === "darwin"
      ? { kind: "role", role: "appMenu" }
      : { kind: "role", role: "fileMenu" },
    edit.length === 0
      ? { kind: "role", role: "editMenu" }
      : {
          entries: [...EDIT_ROLES, { kind: "separator" }, ...edit],
          kind: "submenu",
          label: msg`Edit`,
        },
    { entries: actions("view"), kind: "submenu", label: msg`View` },
  ];
};

export interface ApplicationMenuOptions {
  readonly platform: string;
  readonly commands: readonly Command<CommandId>[];
  readonly dispatcher: Pick<CommandDispatcher, "run">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  /** Hands the built menu to Electron. */
  readonly apply: (sections: readonly MenuSection[]) => void;
  readonly report: (message: string) => void;
}

/** Keeps the application menu built from the commands and the user's shortcuts, rebuilding it when the shortcuts change. */
export class ApplicationMenu {
  readonly #options: ApplicationMenuOptions;

  constructor(options: ApplicationMenuOptions) {
    this.#options = options;
  }

  start(): Unsubscribe {
    this.#build();
    return this.#options.settings.subscribe((changes) => {
      if (changes.some((change) => change.key === "shortcuts.bindings")) {
        this.#build();
      }
    });
  }

  #build(): void {
    const { platform, commands, dispatcher, settings, apply, report } =
      this.#options;
    const bindings = resolveBindings(
      commands,
      settings.get("shortcuts.bindings")
    );
    for (const conflict of conflicts(bindings, platform)) {
      report(`${conflict.ids.join(" and ")} share ${conflict.accelerator}`);
    }
    apply(
      buildMenu({
        bindings,
        commands,
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
