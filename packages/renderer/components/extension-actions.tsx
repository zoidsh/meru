import { EXTENSIONS_ENABLED } from "@meru/shared/build-features";
import { ipc } from "@meru/shared/renderer/ipc";
import { PuzzleIcon } from "lucide-react";
import { TitlebarIconButton } from "@/components/titlebar";
import { useExtensionActionsStore } from "@/lib/extension-actions";
import { useConfig } from "@/lib/react-query";

/**
 * The titlebar button listing the extensions loaded into the account this window
 * shows, drawing nothing at all unless the user has asked for it and an
 * extension is loaded.
 *
 * It's off by default because 1Password, the only extension Meru curates, does
 * its work in the page: the inline autofill menu and the WebAuthn override both
 * run as content scripts on the Google sign-in pages, so the popup the button
 * opens is a surface most users never need.
 *
 * The list itself is a native menu the main process pops up: a renderer-drawn
 * one would be covered wherever a workspace app view sits.
 */
export function ExtensionActions() {
  const { config } = useConfig();

  const actions = useExtensionActionsStore((state) => state.actions);

  if (!EXTENSIONS_ENABLED || !config?.["extensions.showTitlebarButton"] || actions.length === 0) {
    return;
  }

  return (
    <TitlebarIconButton
      title="Show extensions"
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
