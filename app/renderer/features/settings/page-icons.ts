import {
  Columns2Icon,
  InboxIcon,
  KeyboardIcon,
  MailIcon,
  MoonIcon,
  PaletteIcon,
  PanelLeftIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SettingsPageIcon } from "../../../shared/settings/registry.ts";

// Imported by name rather than through lucide's dynamic icons, which would put every icon in the build as a chunk of its own; tsc asks for each icon a page names.
/** The component of each icon a settings page names. */
export const pageIcons: Readonly<Record<SettingsPageIcon, LucideIcon>> = {
  "columns-2": Columns2Icon,
  inbox: InboxIcon,
  keyboard: KeyboardIcon,
  mail: MailIcon,
  moon: MoonIcon,
  palette: PaletteIcon,
  "panel-left": PanelLeftIcon,
  "refresh-cw": RefreshCwIcon,
  users: UsersIcon,
};
