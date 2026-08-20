import { ipc } from "@meru/shared/renderer/ipc";
import { toast } from "sonner";

export function restartRequiredToast() {
  toast.info("Restart Meru to apply the changes.", {
    id: "restart-required",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Restart now",
      onClick: () => {
        ipc.main.send("app.relaunch");
      },
    },
    cancel: {
      label: "Later",
      onClick: () => {},
    },
  });
}
