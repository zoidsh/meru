import { PopupWindow } from "@/components/popup-window";

/**
 * The frame of a page shown in a popup view drawn over a window. The view it
 * fills is transparent and spans the gaps the popup keeps from the window
 * edges, so the frame is what paints, pads and fades the popup in.
 */
export function Popup({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <PopupWindow onClose={onClose}>
      <div
        className="h-screen p-2"
        onClick={(event) => {
          // The view covers the gaps, so a click on one lands in the popup
          // instead of blurring it — closing here is the blur that would
          // have been
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="relative flex h-full animate-in flex-col overflow-hidden rounded-2xl border bg-background duration-100 fade-in-0 zoom-in-95 slide-in-from-top-2">
          {children}
        </div>
      </div>
    </PopupWindow>
  );
}
