import { config } from "@/config";
import { licenseKey } from "../license-key";
import { createBlockMatcher } from "./hosts";

export class Blocker {
  private blockMatcher: ((url: string) => boolean) | undefined;

  init() {
    if (!licenseKey.isValid || !config.get("blocker.enabled")) {
      return;
    }

    this.blockMatcher = createBlockMatcher({
      ads: config.get("blocker.ads"),
      tracking: config.get("blocker.tracking"),
    });
  }

  private onBeforeRequest = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void,
  ) => {
    if (!this.blockMatcher) {
      callback({});

      return;
    }

    if (this.blockMatcher(details.url)) {
      callback({ cancel: true });

      return;
    }

    callback({});
  };

  setupSession(session: Electron.Session) {
    if (this.blockMatcher) {
      session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, this.onBeforeRequest);
    }
  }
}

export const blocker = new Blocker();
