import { Toaster } from "@meru/ui/components/sonner";
import { useHotkeys } from "react-hotkeys-hook";
import { useThemeStore } from "@/lib/theme";

export function PopupWindow({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", () => window.close());

  return (
    <>
      {children}
      <Toaster theme={theme} />
    </>
  );
}
