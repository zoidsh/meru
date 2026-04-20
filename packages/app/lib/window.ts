import { BrowserWindow, screen } from "electron";

const CASCADE_OFFSET = 30;

export function getCascadedWindowBounds({ width, height }: { width: number; height: number }) {
  const allWindows = BrowserWindow.getAllWindows();

  if (!allWindows.length) {
    return { width, height };
  }

  const reference = allWindows.reduce((mostRecent, current) =>
    current.id > mostRecent.id ? current : mostRecent,
  );

  const referenceBounds = reference.getBounds();
  const display = screen.getDisplayMatching(referenceBounds);
  const workArea = display.workArea;

  let x = referenceBounds.x + CASCADE_OFFSET;
  let y = referenceBounds.y + CASCADE_OFFSET;

  if (x + width > workArea.x + workArea.width || y + height > workArea.y + workArea.height) {
    x = workArea.x + CASCADE_OFFSET;
    y = workArea.y + CASCADE_OFFSET;
  }

  return { x, y, width, height };
}
