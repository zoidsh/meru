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
  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", onClose);

  return (
    <>
      {children}
      <Toaster theme={theme} />
    </>
  );
}
