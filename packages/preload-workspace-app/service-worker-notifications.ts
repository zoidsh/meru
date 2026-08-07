import { webFrame } from "electron";

function patchShowNotification() {
  ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon,
        tag: options?.tag,
        silent: options?.silent,
        data: options?.data,
        requireInteraction: options?.requireInteraction,
        lang: options?.lang,
        dir: options?.dir,
      });

      notification.onclick = () => {
        window.focus();
      };

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

export function initServiceWorkerNotifications() {
  webFrame.executeJavaScript(`(${patchShowNotification.toString()})()`).catch((error) => {
    console.error("Failed to patch service worker notifications:", error);
  });
}
