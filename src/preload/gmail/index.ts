import { ipcRenderer, webFrame } from "electron";

import { GMAIL_CHANNELS, isGmailFeatures } from "#contract/gmail-channels.ts";
import type { GmailHealth } from "#contract/gmail-channels.ts";
import { isDarkBackground } from "#core/gmail-dark.ts";
import { isGmailHash } from "#core/gmail-hash.ts";
import {
  GMAIL_FEATURES,
  featureStylesheet,
  insertedFeatures,
} from "#core/gmail-hooks.ts";
import type { GmailFeature, GmailFeatures } from "#core/gmail-hooks.ts";

import { pressRefresh } from "./catch-up.ts";
import { RECHECK_MS, checkHealth } from "./health.ts";
import { undoSent, watchSentNotice } from "./sent.ts";

// Gmail draws a view some time after it moves to it, so a check waits for it
// to settle and looks once more before calling a required hook broken.
const SETTLE_MS = 1000;
const HIDDEN_CHECK_MS = 100;
// How long after the bar goes, with no press of its Undo, a compose in the
// page says Gmail's keyboard Undo brought the draft back. A slower round trip
// reads as the send gone and closes the window, the draft kept in Drafts.
const UNDONE_SETTLE_MS = 500;
const MIN_GAP_MS = 2000;

const inserted = new Map<GmailFeature, string>();

let switches: GmailFeatures | undefined;

/** Whether Gmail's own theme is Dark, which the dark theme's layer needs. */
let gmailDark = false;

/** Whether the last settled check found a body or the editor outside its card. */
let cardsBroken = false;

let themeFrame = 0;

let userStylesKey: string | undefined;

let stopWatchingSent: (() => void) | undefined;

let checking = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastRun = Number.NEGATIVE_INFINITY;
let rechecked = false;
let lastSent = "";

const insert = (feature: GmailFeature, on: boolean) => {
  const key = inserted.get(feature);

  if (on && key === undefined) {
    inserted.set(feature, webFrame.insertCSS(featureStylesheet(feature)));
  } else if (!on && key !== undefined) {
    webFrame.removeInsertedCSS(key);
    inserted.delete(feature);
  }
};

const applyAll = () => {
  if (!switches) {
    return;
  }

  const inserting = insertedFeatures(switches, {
    dark: gmailDark,
    cardsBroken,
  });

  for (const feature of GMAIL_FEATURES) {
    insert(feature, inserting[feature]);
  }
};

/**
 * Reads Gmail's theme once the page is ready, at each move between views, at
 * each health check and after each press, with no observer: a theme changed
 * with neither shows at the next.
 */
const readTheme = () => {
  const dark =
    document.body !== null &&
    isDarkBackground(getComputedStyle(document.body).backgroundColor);

  if (dark !== gmailDark) {
    gmailDark = dark;
    applyAll();
  }
};

/** Checks the page, and says how long to wait before checking again, if at all. */
const check = (): number | undefined => {
  const wait = lastRun + MIN_GAP_MS - performance.now();

  if (wait > 0) {
    return wait;
  }

  lastRun = performance.now();
  readTheme();

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

  const broken =
    found.hooks.bodyCard === "broken" || found.hooks.editorCard === "broken";

  if (broken !== cardsBroken) {
    cardsBroken = broken;
    applyAll();
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
  // Gmail moves to its first view as it draws it, after its theme is set, so
  // the theme is read here too: the settled check would come a second late.
  readTheme();
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
  // Gmail's theme picker changes the theme with no move, on a press.
  document.addEventListener(
    "pointerup",
    () => {
      if (themeFrame === 0) {
        themeFrame = requestAnimationFrame(() => {
          themeFrame = 0;
          readTheme();
        });
      }
    },
    { capture: true, passive: true }
  );
  viewChanged();
};

// Main answers only a Gmail view's own page on Gmail's origin, so on any
// other document this view shows, nothing below ever runs.
ipcRenderer.on(GMAIL_CHANNELS.features, (_event, message: unknown) => {
  if (!isGmailFeatures(message)) {
    return;
  }

  switches = message;
  readTheme();
  applyAll();
  startChecking();
});
ipcRenderer.on(GMAIL_CHANNELS.catchUp, () => {
  pressRefresh(document);
});
ipcRenderer.on(GMAIL_CHANNELS.navigate, (_event, hash: unknown) => {
  if (isGmailHash(hash)) {
    location.hash = hash;
  }
});
ipcRenderer.on(GMAIL_CHANNELS.userStyles, (_event, css: unknown) => {
  if (typeof css !== "string") {
    return;
  }

  if (userStylesKey !== undefined) {
    webFrame.removeInsertedCSS(userStylesKey);
    userStylesKey = undefined;
  }

  if (css !== "") {
    userStylesKey = webFrame.insertCSS(css, { cssOrigin: "author" });
  }
});
// Main sends this to a compose window of its own alone, which hears nothing
// else, so a tab's page never watches and a window does nothing more.
ipcRenderer.on(GMAIL_CHANNELS.watchSent, (_event, watch: unknown) => {
  stopWatchingSent?.();
  stopWatchingSent = undefined;

  if (watch === true) {
    stopWatchingSent = watchSentNotice(
      {
        root: document,
        isVisible: (element) => element.checkVisibility(),
        // A hidden window paints no frames, and main hides one as it sends
        // while it waits for the notice to go. Its visibility state is no
        // guide on Linux, so a timer races the frame everywhere.
        beforePaint: (look) => {
          let looked = false;
          const once = () => {
            if (!looked) {
              looked = true;
              look();
            }
          };

          requestAnimationFrame(once);
          setTimeout(once, HIDDEN_CHECK_MS);
        },
        afterGone: (look) => {
          setTimeout(look, UNDONE_SETTLE_MS);
        },
      },
      (notice) => {
        ipcRenderer.send(GMAIL_CHANNELS.sent, notice);
      }
    );
  }
});
ipcRenderer.on(GMAIL_CHANNELS.undoSent, () => {
  undoSent(document);
});
// A view's first, empty document is no page to ask about.
if (location.protocol !== "about:") {
  document.addEventListener("DOMContentLoaded", readTheme, { once: true });
  ipcRenderer.send(GMAIL_CHANNELS.sync);
}
