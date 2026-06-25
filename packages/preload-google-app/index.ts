import "@meru/shared/electron-api";
import "./ipc";
import { initMailPreload } from "./apps/mail";
import { initMeetPreload } from "./apps/meet";

const appPreloadScripts: Record<string, () => void> = {
  "mail.google.com": initMailPreload,
  "meet.google.com": initMeetPreload,
};

const appPreloadScript = appPreloadScripts[window.location.hostname];

if (appPreloadScript) {
  appPreloadScript();
}
