import "@meru/shared/electron-api";
import "./ipc";
import { initDocsPreload } from "./apps/docs";
import { initMailPreload } from "./apps/mail";
import { initMeetPreload } from "./apps/meet";
import { initServiceWorkerNotifications } from "./service-worker-notifications";

const appPreloadScripts: Record<string, () => void> = {
  "docs.google.com": initDocsPreload,
  "mail.google.com": initMailPreload,
  "meet.google.com": initMeetPreload,
};

const appPreloadScript = appPreloadScripts[window.location.hostname];

if (appPreloadScript) {
  appPreloadScript();
}

// Gmail notifications are already created natively in the main process, shimming them here would show them twice
if (window.location.hostname !== "mail.google.com") {
  initServiceWorkerNotifications();
}
