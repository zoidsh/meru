import { useMemo } from "react";

import { glyphs, resolveBindings } from "../../../core/engines/shortcuts.ts";
import { commands } from "../../../shared/commands/registry.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { useClient } from "../../chrome-context.tsx";
import { useSetting } from "../settings/use-setting.ts";

// A native title rather than a page tooltip: anything the chrome page draws past the titlebar and the sidebar sits under the panes' views.
/** A control's tooltip: its label, and after it the shortcut of the command it runs in the platform's glyphs, when it has one. */
export const useTooltip = (label: string, commandId?: CommandId): string => {
  const { platform } = useClient();
  const bindings = useSetting("shortcuts.bindings");
  return useMemo(() => {
    if (commandId === undefined) {
      return label;
    }
    const accelerator = resolveBindings(commands, bindings, platform).get(
      commandId
    );
    const shown =
      accelerator === null || accelerator === undefined
        ? undefined
        : glyphs(accelerator, platform);
    return shown === undefined ? label : `${label} (${shown})`;
  }, [bindings, commandId, label, platform]);
};
