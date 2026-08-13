import { PopupWindow } from "@/components/popup-window";

/**
 * The frame of a page shown in a popup view drawn over a window. The view it
 * fills is transparent, so the frame is what paints and fades the popup in.
 */
export function Popup({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <PopupWindow onClose={onClose}>
      <div className="flex h-screen animate-in flex-col rounded-2xl border bg-background duration-100 fade-in-0 zoom-in-95 slide-in-from-top-2">
        {children}
      </div>
    </PopupWindow>
  );
}
