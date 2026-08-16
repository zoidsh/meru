import { ipc } from "@meru/shared/renderer/ipc";
import type { ExtensionActionState } from "@meru/shared/types";
import { PuzzleIcon } from "lucide-react";
import { TitlebarButtonGroup, TitlebarIconButton } from "@/components/titlebar";
import { useExtensionActionsStore } from "@/lib/extension-actions";

function ExtensionActionButton({ action }: { action: ExtensionActionState }) {
  return (
    <TitlebarIconButton
      onClick={(event) => {
        const { x, y, width, height } = event.currentTarget.getBoundingClientRect();

        ipc.main.send("extensions.toggleActionPopup", action.extensionId, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        });
      }}
      onMouseEnter={() => {
        ipc.main.send("extensions.setActionPopupCloseOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("extensions.setActionPopupCloseOnBlurEnabled", true);
      }}
      title={action.title}
    >
      {action.iconDataUrl ? (
        <img src={action.iconDataUrl} alt="" className="size-4" />
      ) : (
        <PuzzleIcon />
      )}
    </TitlebarIconButton>
  );
}

/**
 * One button per extension loaded into the account this window shows, drawing
 * nothing at all while no extension is loaded — which is every window until
 * extensions can be installed.
 */
export function ExtensionActions() {
  const actions = useExtensionActionsStore((state) => state.actions);

  if (actions.length === 0) {
    return;
  }

  return (
    <TitlebarButtonGroup>
      {actions.map((action) => (
        <ExtensionActionButton key={action.extensionId} action={action} />
      ))}
    </TitlebarButtonGroup>
  );
}
