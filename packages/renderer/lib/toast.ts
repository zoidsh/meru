import { ipc } from "@meru/shared/renderer/ipc";
import { toast } from "sonner";

export function restartRequiredToast() {
  toast.info("A restart is required for the changes to take full effect.", {
    id: "restart-required",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Restart Now",
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
