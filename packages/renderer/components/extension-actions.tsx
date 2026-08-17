import { ipc } from "@meru/shared/renderer/ipc";
import { PuzzleIcon } from "lucide-react";
import { TitlebarIconButton } from "@/components/titlebar";
import { useExtensionActionsStore } from "@/lib/extension-actions";

/**
 * The titlebar button listing the extensions loaded into the account this window
 * shows, drawing nothing at all while no extension is loaded — which is every
 * window until extensions can be installed.
 *
 * The list itself is a native menu the main process pops up: a renderer-drawn
 * one would be covered wherever a workspace app view sits.
 */
export function ExtensionActions() {
  const actions = useExtensionActionsStore((state) => state.actions);

  if (actions.length === 0) {
    return;
  }

  return (
    <TitlebarIconButton
      title="Extensions"
      onClick={(event) => {
        const { x, y, width, height } = event.currentTarget.getBoundingClientRect();

        ipc.main.send("extensions.showActionsMenu", {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        });
      }}
    >
      <PuzzleIcon />
    </TitlebarIconButton>
  );
}
