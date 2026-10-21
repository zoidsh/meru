import { useLingui } from "@lingui/react/macro";
import { DialogContent } from "@meru/ui/components/dialog";
import type { ComponentProps } from "react";

/**
 * `packages/ui` stays vendored, so its dialog takes the close button's label as
 * a prop, and this gives it the translated one.
 */
export function SettingsDialogContent(
  props: Omit<ComponentProps<typeof DialogContent>, "closeLabel">,
) {
  const { t } = useLingui();

  return (
    <DialogContent
      closeLabel={t({
        message: "Close",
        comment: "Screen reader label of the button that closes a dialog in Settings",
      })}
      {...props}
    />
  );
}
