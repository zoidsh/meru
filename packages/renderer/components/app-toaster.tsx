import { useLingui } from "@lingui/react/macro";
import { Toaster } from "@meru/ui/components/sonner";
import { useThemeStore } from "@/lib/theme";

/**
 * `packages/ui` stays vendored, so its toaster takes its screen reader label as
 * a prop, and this gives it the translated one along with the theme.
 */
export function AppToaster() {
  const { t } = useLingui();

  const theme = useThemeStore((state) => state.theme);

  return (
    <Toaster
      theme={theme}
      containerAriaLabel={t({
        message: "Notifications",
        context: "toasts",
        comment:
          "Screen reader label of the area of the window where Meru's toasts appear, not the system's notifications",
      })}
    />
  );
}
