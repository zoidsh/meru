import { useLingui } from "@lingui/react/macro";
import { Toaster } from "@meru/ui/components/sonner";
import { useHotkeys } from "react-hotkeys-hook";
import { useThemeStore } from "@/lib/theme";

export function PopupWindow({
  children,
  onClose = () => window.close(),
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useLingui();

  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", onClose);

  return (
    <>
      {children}
      <Toaster
        theme={theme}
        containerAriaLabel={t({
          message: "Notifications",
          context: "toasts",
          comment:
            "Screen reader label of the area of the window where Meru's toasts appear, not the system's notifications",
        })}
      />
    </>
  );
}
