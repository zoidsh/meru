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
        <ToastTitle />
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
  target,
}: Extract<ShellState["overlay"], { kind: "toast" }> & {
  /** The overlay's document, which the toast is portalled into. */
  target: Document;
}) => {
  const { t } = useLingui();
  const text = {
    "no-room": t({
      message: "Not enough room to split",
      comment:
        "Short notice at the foot of the window when a split would leave a pane too small",
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
        <ToastViewport>
          <NoticeList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
};
