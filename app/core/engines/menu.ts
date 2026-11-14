import type { MenuEntry, MenuSection, MenuSectionId } from "../records/menu.ts";

const EDIT_ROLES: readonly MenuEntry<never>[] = [
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

const MINIMIZE: MenuEntry<never> = { kind: "role", role: "minimize" };

const MAC_APP_ROLES: readonly MenuEntry<never>[] = [
  { kind: "role", role: "services" },
  { kind: "separator" },
  { kind: "role", role: "hide" },
  { kind: "role", role: "hideOthers" },
  { kind: "role", role: "unhide" },
  { kind: "separator" },
];

export interface MenuCommand<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly menu?: { readonly section: MenuSectionId; readonly order: number };
}

/** The titles of the submenus the app names itself, in the user's language. */
export type MenuLabels = Readonly<
  Record<Exclude<MenuSectionId, "app">, string>
>;

export interface MenuOptions<Id extends string> {
  readonly platform: string;
  readonly commands: readonly MenuCommand<Id>[];
  readonly bindings: ReadonlyMap<Id, string | null>;
  readonly labels: MenuLabels;
  /** Whether a command can run now; the menu shows one that cannot disabled. */
  readonly enabled: (id: Id) => boolean;
  readonly run: (id: Id, windowId: number) => void;
}

/** The application menu: the app-named menu first on every platform, as 3.x has it, with macOS's own roles only there, then each section's commands in order, with the resolved shortcuts. */
export const buildMenu = <Id extends string>({
  platform,
  commands,
  bindings,
  labels,
  enabled,
  run,
}: MenuOptions<Id>): MenuSection<Id>[] => {
  const actions = (section: MenuSectionId): MenuEntry<Id>[] =>
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
  const submenu = (
    section: Exclude<MenuSectionId, "app">,
    entries: readonly MenuEntry<Id>[] = actions(section)
  ): MenuSection<Id>[] =>
    entries.length === 0
      ? []
      : [{ entries, kind: "submenu", label: labels[section] }];
  const edit = actions("edit");
  const file = actions("file");
  const mac = platform === "darwin";
  return [
    {
      entries: [
        { kind: "role", role: "about" },
        { kind: "separator" },
        ...actions("app"),
        { kind: "separator" },
        ...(mac ? MAC_APP_ROLES : []),
        { kind: "role", role: "quit" },
      ],
      kind: "app",
    },
    ...submenu(
      "file",
      file.length === 0
        ? []
        : [
            ...file,
            { kind: "separator" },
            { kind: "role", role: "close" },
            ...(mac ? [] : [MINIMIZE]),
          ]
    ),
    edit.length === 0
      ? { kind: "role", role: "editMenu" }
      : {
          entries: [...EDIT_ROLES, { kind: "separator" }, ...edit],
          kind: "submenu",
          label: labels.edit,
        },
    { entries: actions("view"), kind: "submenu", label: labels.view },
    ...submenu("history"),
    ...submenu("profiles"),
  ];
};
