import { useHotkeys } from "react-hotkeys-hook";
import { AppToaster } from "@/components/app-toaster";

export function PopupWindow({
  children,
  onClose = () => window.close(),
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  useHotkeys("esc", onClose);

  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
