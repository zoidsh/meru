import { FiltersEngine, Request } from "@ghostery/adblocker";
import { config } from "@/config";
import { EMAIL_TRACKERS_REGEXP } from "./trackers";
import { licenseKey } from "../license-key";
import easylist from "./lists/easylist.txt";
import easyprivacy from "./lists/easyprivacy.txt";

export class Blocker {
  private _engine: FiltersEngine | undefined;

  blockTracking = false;

  get engine() {
    if (!this._engine) {
      throw new Error("Blocker engine is not initialized");
    }

    return this._engine;
  }

  set engine(engine: FiltersEngine) {
    this._engine = engine;
  }

  async init() {
    if (!licenseKey.isValid || !config.get("blocker.enabled")) {
      return;
    }

    const lists: string[] = [];

    if (config.get("blocker.ads")) {
      lists.push(easylist);
    }

    this.blockTracking = config.get("blocker.tracking");

    if (this.blockTracking) {
      lists.push(easyprivacy);
    }

    if (!lists.length) {
      return;
    }

    this.engine = FiltersEngine.parse(lists.join("\n"));
  }

  private onBeforeRequest = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void,
  ) => {
    const { id, url, resourceType, referrer } = details;

    const { redirect, match } = this.engine.match(
      Request.fromRawDetails({
        _originalRequestDetails: details,
        requestId: `${id}`,
        url,
        type: resourceType,
        sourceUrl: referrer,
      }),
    );

    if (redirect) {
      callback({ redirectURL: redirect.dataUrl });

      return;
    }

    if (match || (this.blockTracking && EMAIL_TRACKERS_REGEXP.test(url))) {
      callback({ cancel: true });

      return;
    }

    callback({});
  };

  setupSession(session: Electron.Session) {
    if (this._engine) {
      session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, this.onBeforeRequest);
    }
  }
}

export const blocker = new Blocker();
