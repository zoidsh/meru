import { config } from "@/config";
import { licenseKey } from "../license-key";
import { createBlockMatcher } from "./hosts";

export class Blocker {
  private matches: ((url: string) => boolean) | undefined;

  init() {
    if (!licenseKey.isValid || !config.get("blocker.enabled")) {
      return;
    }

    this.matches = createBlockMatcher({
      ads: config.get("blocker.ads"),
      tracking: config.get("blocker.tracking"),
    });
  }

  private onBeforeRequest = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void,
  ) => {
    if (this.matches?.(details.url)) {
      callback({ cancel: true });

      return;
    }

    callback({});
  };

  setupSession(session: Electron.Session) {
    if (this.matches) {
      session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, this.onBeforeRequest);
    }
  }
}

export const blocker = new Blocker();
