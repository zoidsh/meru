import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

import type { ShellState } from "#contract/shell.ts";
import {
  Toast as ToastRoot,
  ToastContent,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  useToastManager,
} from "#ui/toast.tsx";

const notices = createToastManager();

const NoticeList = () => {
  const { toasts } = useToastManager();

  return toasts.map((notice) => (
    <ToastRoot key={notice.id} toast={notice}>
      <ToastContent>
        {/* A one-line toast fills the view main sizes for it, so a long page
            title is cut to that line, keeping "Bookmarked" in sight. */}
        <ToastTitle className="min-w-0 truncate" />
      </ToastContent>
    </ToastRoot>
  ));
};

/**
 * A short notice, drawn in the overlay's view, which main sizes to the toast
 * alone and closes once it has been read; it never closes itself, so it
 * does not slide away from a view still shown.
 */
export const Toast = ({
  message,
  title,
  target,
}: Extract<ShellState["overlay"], { kind: "toast" }> & {
  /** The overlay's document, which the toast is portalled into. */
  target: Document;
}) => {
  const { t } = useLingui();
  const page = title ?? "";
  const text = {
    "no-room": t({
      message: "Not enough room to split",
      comment:
        "Short notice at the foot of the window when a split would leave a pane too small",
    }),
    bookmarked: t({
      message: `Bookmarked ${page}`,
      comment:
        "Short notice at the foot of the window once the selected tab's page is bookmarked; {page} is the page's title",
    }),
    "bookmark-removed": t({
      message: "Bookmark removed",
      comment:
        "Short notice at the foot of the window once the selected tab's page is no longer bookmarked",
    }),
    "downloads-folder-missing": t({
      message: "Saved to Downloads because your folder isn't available",
      comment:
        "Short notice at the foot of the window when the folder chosen in Settings for downloads is missing or cannot be written, so a download went to the system's Downloads folder",
    }),
  }[message];

  useEffect(() => {
    const id = notices.add({ title: text, timeout: 0 });

    return () => {
      notices.close(id);
    };
  }, [text]);

  return (
    <ToastProvider toastManager={notices}>
      <ToastPortal container={target.body}>
        <ToastViewport
          aria-label={t({
            message: "Notifications",
            comment:
              "Accessible name of the region at the foot of the window that holds Meru's short notices, such as one saying there is not enough room to split",
          })}
        >
          <NoticeList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
};
