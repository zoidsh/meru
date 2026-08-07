import { ipc } from "@meru/shared/renderer/ipc";
import type { WorkspaceAppNotification } from "@meru/shared/types";
import { contextBridge, webFrame } from "electron";

declare global {
  interface Window {
    meruShowNotification: (notification: WorkspaceAppNotification) => void;
  }
}

function patchShowNotification() {
  ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
    window.meruShowNotification({
      title,
      body: options?.body,
      silent: options?.silent ?? undefined,
      requireInteraction: options?.requireInteraction,
    });

    return Promise.resolve();
  };
}

export function initServiceWorkerNotifications() {
  contextBridge.exposeInMainWorld(
    "meruShowNotification",
    (notification: WorkspaceAppNotification) => {
      ipc.main.send("workspaceApp.showNotification", notification);
    },
  );

  webFrame.executeJavaScript(`(${patchShowNotification.toString()})()`).catch((error) => {
    console.error("Failed to patch service worker notifications:", error);
  });
}
