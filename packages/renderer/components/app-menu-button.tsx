import { useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import { EllipsisVerticalIcon } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Windows and Linux have no system menu bar, so this button is the menu. It is
 * not a tab stop either: F10 and a tap of Alt open it, the way they open a menu
 * anywhere else on those platforms, and both arrive here so that the menu comes
 * up against the button whichever way it was asked for.
 */
export function AppMenuButton({ className }: { className?: string }) {
  const { t } = useLingui();

  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleAppMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();

    ipc.main.send(
      "titleBar.toggleAppMenu",
      rect && { x: Math.round(rect.left), y: Math.round(rect.bottom) },
    );
  };

  useEffect(() => {
    return ipc.renderer.on("appMenu.toggle", toggleAppMenu);
  });

  if (window.electron.process.platform === "darwin") {
    return;
  }

  return (
    <div className={cn("draggable-none", className)}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        onClick={toggleAppMenu}
        title={t({
          message: "App menu",
          comment:
            "Titlebar button on Windows and Linux that opens Meru's menu, in place of a menu bar",
        })}
      >
        <EllipsisVerticalIcon />
      </Button>
    </div>
  );
}
