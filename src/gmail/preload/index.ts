import "./electron-api";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initUrlPreview } from "./url-preview";

initIpc();
initUrlPreview();
initInboxObserver();
