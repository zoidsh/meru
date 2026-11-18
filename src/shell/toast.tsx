// Bundled, since the styles Sonner injects inline are refused by the
// shell's content security policy.
import "sonner/dist/styles.css";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import type { CSSProperties } from "react";
import { Toaster, toast } from "sonner";

import type { ShellState } from "#contract/shell.ts";

const TOASTER_STYLE = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
} as CSSProperties;

/**
 * A short notice, drawn in the overlay's view, which main sizes to the toast
 * alone and closes once it has been read; Sonner keeps it until then, so it
 * does not slide away from a view still shown.
 */
export const Toast = ({
  message,
}: Extract<ShellState["overlay"], { kind: "toast" }>) => {
  const { t } = useLingui();
  const text = {
    "no-room": t({
      message: "Not enough room to split",
      comment:
        "Short notice at the foot of the window when a split would leave a pane too small",
    }),
  }[message];

  useEffect(() => {
    const id = toast(text, { duration: Number.POSITIVE_INFINITY });

    return () => {
      toast.dismiss(id);
    };
  }, [text]);

  // No hotkey: the overlay's document never has the keyboard while a toast shows.
  return (
    <Toaster
      position="bottom-right"
      offset={16}
      mobileOffset={16}
      hotkey={[]}
      style={TOASTER_STYLE}
    />
  );
};
