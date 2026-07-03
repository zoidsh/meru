import { config } from "@/config";
import { licenseKey } from "../license-key";
import { GOOGLE_AD_HOSTS, GOOGLE_TRACKER_HOSTS, hasGoogleTelemetry, isBlockedHost } from "./hosts";
import { EMAIL_TRACKERS_REGEXP } from "./trackers";

export class Blocker {
  private blockedHosts = new Set<string>();

  blockTracking = false;

  init() {
    if (!licenseKey.isValid || !config.get("blocker.enabled")) {
      return;
    }

    if (config.get("blocker.ads")) {
      for (const host of GOOGLE_AD_HOSTS) {
        this.blockedHosts.add(host);
      }
    }

    this.blockTracking = config.get("blocker.tracking");

    if (this.blockTracking) {
      for (const host of GOOGLE_TRACKER_HOSTS) {
        this.blockedHosts.add(host);
      }
    }
  }

  private get isActive() {
    return this.blockedHosts.size > 0 || this.blockTracking;
  }

  private onBeforeRequest = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void,
  ) => {
    const { url } = details;

    let hostname: string;

    try {
      hostname = new URL(url).hostname;
    } catch {
      callback({});

      return;
    }

    if (
      isBlockedHost(hostname, this.blockedHosts) ||
      (this.blockTracking && (EMAIL_TRACKERS_REGEXP.test(url) || hasGoogleTelemetry(url)))
    ) {
      callback({ cancel: true });

      return;
    }

    callback({});
  };

  setupSession(session: Electron.Session) {
    if (this.isActive) {
      session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, this.onBeforeRequest);
    }
  }
}

export const blocker = new Blocker();
