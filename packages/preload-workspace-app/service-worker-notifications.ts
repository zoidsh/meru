import { ipc } from "@meru/shared/renderer/ipc";
import type { WorkspaceAppNotification } from "@meru/shared/types";
import { contextBridge, webFrame } from "electron";

declare global {
  interface Window {
    meruShowNotification: (notification: WorkspaceAppNotification) => void;
  }
}

function patchShowNotification() {
  console.log(
    "[meru:notifications] main world reached, bridge is",
    typeof window.meruShowNotification,
  );

  ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
    console.log("[meru:notifications] intercepted", title, options);

    try {
      window.meruShowNotification({
        title,
        body: options?.body,
        silent: options?.silent ?? undefined,
        requireInteraction: options?.requireInteraction,
      });

      console.log("[meru:notifications] handed to bridge");
    } catch (error) {
      console.error("[meru:notifications] bridge call threw", error);
    }

    return Promise.resolve();
  };

  console.log("[meru:notifications] prototype patched");
}

export function initServiceWorkerNotifications() {
  console.log("[meru:notifications] init on", window.location.hostname);

  try {
    contextBridge.exposeInMainWorld(
      "meruShowNotification",
      (notification: WorkspaceAppNotification) => {
        console.log("[meru:notifications] bridge invoked", notification);

        try {
          ipc.main.send("workspaceApp.showNotification", notification);

          console.log("[meru:notifications] ipc sent");
        } catch (error) {
          console.error("[meru:notifications] ipc send threw", error);
        }
      },
    );

    console.log("[meru:notifications] bridge exposed");
  } catch (error) {
    console.error("[meru:notifications] exposing bridge threw", error);
  }

  webFrame
    .executeJavaScript(`(${patchShowNotification.toString()})()`)
    .then(() => {
      console.log("[meru:notifications] injection resolved");
    })
    .catch((error) => {
      console.error("[meru:notifications] injection failed", error);
    });
}
