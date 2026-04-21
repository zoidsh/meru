import { t } from "@meru/i18n";
import { ipc } from "@meru/renderer-lib/ipc";
import { toast } from "sonner";

export function restartRequiredToast() {
  toast.info(t("toast.restartRequired.message"), {
    id: "restart-required",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: t("toast.restartRequired.restartNow"),
      onClick: () => {
        ipc.main.send("app.relaunch");
      },
    },
    cancel: {
      label: t("toast.restartRequired.later"),
      onClick: () => {},
    },
  });
}
