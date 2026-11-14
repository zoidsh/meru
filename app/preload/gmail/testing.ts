import { expect, vi } from "vitest";

import { gmail, gmailPushes } from "../../shared/channels/gmail.ts";
import type {
  GmailPageSettings,
  GmailStyles,
} from "../../shared/channels/gmail.ts";
import { gmailSurface } from "../../shared/channels/surfaces.ts";
import { FakeContentBridge } from "../content/fake-bridge.ts";
import { isHtmlElement, queryAll } from "../content/query.ts";
import type { StyleRule } from "../content/styles.ts";
import { startGmail } from "./app.ts";
import type { GmailApp } from "./app.ts";
import type { GmailFeature } from "./feature.ts";

export const MAILBOX = "https://mail.google.com/mail/u/0";

export const testSettings: GmailPageSettings = {
  labelColors: [],
  mailbox: MAILBOX,
  signIn: "https://accounts.google.com",
  styles: {
    hideGmailLogo: false,
    hidePromoBanner: false,
    hideUpgradeButton: false,
    reverseConversation: false,
    showTrimmedContent: false,
  },
  userStyles: "",
  version: 1,
};

/** The `styles` settings with only the named ones on. */
export const stylesWith = (
  ...on: readonly (keyof GmailStyles)[]
): GmailStyles => {
  const off = { ...testSettings.styles };
  for (const name of on) {
    off[name] = true;
  }
  return off;
};

export interface MountedGmail {
  readonly app: GmailApp;
  readonly bridge: FakeContentBridge<typeof gmailSurface>;
  /** Takes the page elsewhere, as Gmail navigating itself would. */
  readonly go: (href: string) => void;
  /** The fragment the page was taken to, if any. */
  readonly hash: () => string | undefined;
  /** What main sent the page next, applied as a change. */
  readonly change: (settings: Partial<GmailPageSettings>) => void;
  /** The text of a feature's style sheet, or undefined while it has none. */
  readonly sheet: (id: string) => string | undefined;
  /** Runs the frames asked for so far; the count is how many. */
  readonly run: () => number;
  /** Waits for the page's changes to reach the scheduler, then runs their frames. */
  readonly settle: () => Promise<number>;
}

/** The preload over a fixture, assembled as `index.ts` assembles it, with one fake bridge and the page's frames in the test's hands. */
export const mountGmail = (options: {
  html?: string;
  settings?: Partial<GmailPageSettings>;
  features?: readonly GmailFeature[];
  href?: string;
  now?: () => number;
  grace?: number;
}): MountedGmail => {
  document.head.innerHTML = "";
  document.body.innerHTML = options.html ?? "";
  const bridge = new FakeContentBridge(gmailSurface);
  const settings = { ...testSettings, ...options.settings };
  bridge.answer(gmail.settings, settings);
  let hash: string | undefined;
  let href = options.href ?? `${MAILBOX}/#inbox`;
  const tasks: (() => void)[] = [];
  const run = () => {
    const pending = tasks.splice(0);
    for (const task of pending) {
      task();
    }
    return pending.length;
  };
  const app = startGmail({
    bridge,
    document,
    features: options.features,
    grace: options.grace,
    location: {
      href: () => href,
      setHash: (next) => {
        hash = next;
      },
    },
    now: options.now,
    requestFrame: (task) => {
      tasks.push(task);
    },
  });
  return {
    app,
    bridge,
    change: (next) => {
      bridge.push(gmailPushes.settingsChanged, {
        ...settings,
        ...next,
        version: settings.version + 1,
      });
    },
    go: (next) => {
      href = next;
    },
    hash: () => hash,
    run,
    settle: async () => {
      await vi.waitFor(() => {
        expect(tasks.length).toBeGreaterThan(0);
      });
      return run();
    },
    sheet: (id) =>
      queryAll(document, `style[data-meru-style="${id}"]`, isHtmlElement).at(0)
        ?.textContent ?? undefined,
  };
};

/** The elements a feature's rules reach in the fixture, which is what a selector anchored on a marker Google still uses finds. */
export const reached = (rules: readonly StyleRule[]): HTMLElement[] => {
  const found: HTMLElement[] = [];
  for (const rule of rules) {
    for (const element of queryAll(document, rule.selector, isHtmlElement)) {
      if (!found.includes(element)) {
        found.push(element);
      }
    }
  }
  return found;
};
