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
        {/* The view main sizes for the toast holds two lines, so a long page
            title is cut at the second, keeping "Bookmarked" in sight. */}
        <ToastTitle className="line-clamp-2 min-w-0" />
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
        "Short notice at the foot of the window when a split would leave a pane too small; at most two lines of a narrow notice",
    }),
    bookmarked: t({
      message: `Bookmarked ${page}`,
      comment:
        "Short notice at the foot of the window once the selected tab's page is bookmarked; {page} is the page's title",
    }),
    "bookmark-removed": t({
      message: "Bookmark removed",
      comment:
        "Short notice at the foot of the window once the selected tab's page is no longer bookmarked; at most two lines of a narrow notice",
    }),
    "downloads-folder-missing": t({
      message: "Saved to Downloads because your folder isn't available",
      comment:
        "Short notice at the foot of the window when the folder chosen in Settings for downloads is missing or cannot be written, so a download went to the system's Downloads folder; at most two lines of a narrow notice",
    }),
    "one-profile": t({
      message:
        "The free version uses one profile. Upgrade to Meru Pro to add more.",
      comment:
        "Short notice at the foot of the window when Gmail's Add another account is clicked on the free version, which adds no profile; at most two lines of a narrow notice",
    }),
    "pro-ends-trial-ended": t({
      message:
        "Your trial has ended. Pro features turn off when you quit Meru.",
      comment:
        "Short notice at the foot of the window when the Meru Pro trial ends while Meru is running; what Pro unlocked stays on until Meru is quit; at most two lines of a narrow notice",
    }),
    "pro-ends-license-refused": t({
      message:
        "Your license can't be used. Pro features turn off when you quit Meru.",
      comment:
        "Short notice at the foot of the window when the license server stops accepting the license (a refund, or the device removed) while Meru is running; at most two lines of a narrow notice",
    }),
    "pro-ends-license-unconfirmed": t({
      message:
        "Meru couldn't confirm your license. Pro features turn off when you quit Meru.",
      comment:
        "Short notice at the foot of the window when the license could not be confirmed for 14 days, as Meru could not reach its server, while Meru is running; at most two lines of a narrow notice",
    }),
    "pro-ends-trial-unconfirmed": t({
      message:
        "Meru couldn't confirm your trial. Pro features turn off when you quit Meru.",
      comment:
        "Short notice at the foot of the window when the trial could not be confirmed for 14 days, as Meru could not reach its server, while Meru is running; at most two lines of a narrow notice",
    }),
    "pro-ends-date-wrong": t({
      message:
        "Your computer's date looks wrong. Pro features turn off when you quit Meru.",
      comment:
        "Short notice at the foot of the window when the computer's clock reads well before the license or trial was last confirmed, while Meru is running; at most two lines of a narrow notice",
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
