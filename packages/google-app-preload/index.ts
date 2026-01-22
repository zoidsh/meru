import "./electron-api";
import { initMeetPreload } from "./apps/meet";

const appPreloadScripts: Record<string, () => void> = {
	"meet.google.com": initMeetPreload,
};

const appPreloadScript = appPreloadScripts[window.location.hostname];

if (appPreloadScript) {
	appPreloadScript();
}
