import { ipcRenderer, webFrame } from "electron";

import { GMAIL_CHANNELS, isGmailFeatures } from "#contract/gmail-channels.ts";
import type { GmailHealth } from "#contract/gmail-channels.ts";
import { GMAIL_FEATURES, featureStylesheet } from "#core/gmail-hooks.ts";
import type { GmailFeature } from "#core/gmail-hooks.ts";

import { pressRefresh } from "./catch-up.ts";
import { RECHECK_MS, checkHealth } from "./health.ts";

// Gmail draws a view some time after it moves to it, so a check waits for it
// to settle and looks once more before calling a required hook broken.
const SETTLE_MS = 1000;
const MIN_GAP_MS = 2000;

const inserted = new Map<GmailFeature, string>();

let checking = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastRun = Number.NEGATIVE_INFINITY;
let rechecked = false;
let lastSent = "";

/** Checks the page, and says how long to wait before checking again, if at all. */
const check = (): number | undefined => {
  const wait = lastRun + MIN_GAP_MS - performance.now();

  if (wait > 0) {
    return wait;
  }

  lastRun = performance.now();

  const found = checkHealth({
    root: document,
    hash: location.hash,
    isVisible: (element) => element.checkVisibility(),
  });
  const ms = Math.round(performance.now() - lastRun);
  const settled =
    found.views.length > 0 && !Object.values(found.hooks).includes("broken");

  if (!settled && !rechecked) {
    rechecked = true;

    return RECHECK_MS;
  }

  const key = JSON.stringify(found);

  if (found.views.length > 0 && key !== lastSent) {
    lastSent = key;
    ipcRenderer.send(GMAIL_CHANNELS.health, {
      ...found,
      ms,
    } satisfies GmailHealth);
  }

  return undefined;
};

const schedule = (delay: number) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const next = check();

    if (next !== undefined) {
      schedule(next);
    }
  }, delay);
};

const viewChanged = () => {
  rechecked = false;
  schedule(SETTLE_MS);
};

/** Checks once the page is up, then after each move within it. */
const startChecking = () => {
  if (checking) {
    return;
  }

  checking = true;
  // Gmail moves between views by the history API as well as by the hash,
  // which only the Navigation API hears.
  navigation.addEventListener("currententrychange", viewChanged);
  viewChanged();
};

const apply = (feature: GmailFeature, on: boolean) => {
  const key = inserted.get(feature);

  if (on && key === undefined) {
    inserted.set(feature, webFrame.insertCSS(featureStylesheet(feature)));
  } else if (!on && key !== undefined) {
    webFrame.removeInsertedCSS(key);
    inserted.delete(feature);
  }
};

// Main answers only a Gmail view's own page on Gmail's origin, so on any
// other document this view shows, nothing below ever runs.
ipcRenderer.on(GMAIL_CHANNELS.features, (_event, message: unknown) => {
  if (!isGmailFeatures(message)) {
    return;
  }

  for (const feature of GMAIL_FEATURES) {
    apply(feature, message[feature]);
  }

  startChecking();
});
ipcRenderer.on(GMAIL_CHANNELS.catchUp, () => {
  pressRefresh(document);
});
// A view's first, empty document is no page to ask about.
if (location.protocol !== "about:") {
  ipcRenderer.send(GMAIL_CHANNELS.sync);
}
