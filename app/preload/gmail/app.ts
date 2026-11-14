import { DisposableStore } from "../../core/disposable.ts";
import { gmail, gmailPushes } from "../../shared/channels/gmail.ts";
import type { GmailPageSettings } from "../../shared/channels/gmail.ts";
import type { GmailSurface } from "../../shared/channels/surfaces.ts";
import type { Bridge } from "../content/bridge-port.ts";
import { DomScheduler } from "../content/scheduler.ts";
import { StyleLayers } from "../content/styles.ts";
import type { GmailFeature, PageLocation } from "./feature.ts";
import { gmailFeatures } from "./features/index.ts";

export interface GmailAppOptions {
  readonly document: Document;
  readonly bridge: Bridge<GmailSurface>;
  readonly location: PageLocation;
  readonly features?: readonly GmailFeature[];
  readonly now?: () => number;
  readonly grace?: number;
  readonly requestFrame?: (task: () => void) => void;
}

export interface GmailApp {
  readonly dispose: () => void;
}

/** The Gmail preload: it reads the settings main holds before the page paints, applies each feature the address allows, and applies them again whenever main says they changed. */
export const startGmail = (options: GmailAppOptions): GmailApp => {
  const { bridge, document, location } = options;
  const features = options.features ?? gmailFeatures;
  const styles = new StyleLayers(document);
  const first = bridge.sendSync(gmail.settings, {});
  if (!first.ok) {
    // Main is where a failure is logged; a page that writes to its console is heard there as a page error.
    // oxlint-disable-next-line eslint/no-console
    console.error("Meru could not read the Gmail settings", first.error);
    return {
      dispose: () => {
        styles.dispose();
      },
    };
  }

  const scheduler = new DomScheduler({
    document,
    grace: options.grace,
    now: options.now,
    report: (selector) => {
      bridge.send(gmail.selectorMiss, { selector });
    },
    requestFrame: options.requestFrame,
  });
  const asked = new Set<string>();
  let applied = new DisposableStore();

  const apply = (settings: GmailPageSettings) => {
    applied.dispose();
    const store = new DisposableStore();
    applied = store;
    const underMailbox = location.href().startsWith(settings.mailbox);
    for (const feature of features) {
      if (feature.anywhere !== true && !underMailbox) {
        styles.remove(feature.id);
        continue;
      }
      feature.apply({
        bridge,
        document,
        location,
        once: (key) => {
          const asking = !asked.has(key);
          asked.add(key);
          return asking;
        },
        scheduler,
        settings,
        style: (css) => {
          styles.set(feature.id, css);
        },
        undo: (disposer) => {
          store.add(disposer);
        },
      });
    }
    bridge.send(gmail.settingsAck, { version: settings.version });
  };

  apply(first.value);
  const unfollow = bridge.on(gmailPushes.settingsChanged, apply);
  scheduler.start();

  return {
    dispose: () => {
      unfollow();
      applied.dispose();
      scheduler.dispose();
      styles.dispose();
    },
  };
};
