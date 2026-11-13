import { isSingleInstance } from "../records/app.ts";
import type { App } from "../records/app.ts";
import type { Group } from "../records/group.ts";
import type { Disposition } from "../records/link.ts";
import type { Tab } from "../records/tab.ts";
import { orderedTabs, rowTabs } from "./ordering.ts";

/** The settings link routing reads, resolved for the profile the link was followed in. */
export interface LinkSettings {
  /** Whether a link to a Google app opens inside Meru at all. */
  readonly openInApp: boolean;
  /** Apps whose links always open in the browser. */
  readonly excludedApps: readonly string[];
  /** Whether an app a link opens becomes a tab or a window of its own. */
  readonly mode: "tabs" | "windows";
}

export interface LinkContext {
  readonly catalog: readonly App[];
  readonly groups: readonly Group[];
  readonly tabs: readonly Tab[];
  readonly settings: LinkSettings;
  /** The tab whose pane the link was followed in. */
  readonly from: Tab;
  readonly disposition?: Disposition;
}

export type LinkTarget =
  | { readonly action: "samePane" }
  /** A tab of the app takes the link: `tabId` when one of the profile's tabs already shows it, a new one otherwise. */
  | {
      readonly action: "newTab";
      readonly appId: string;
      readonly tabId?: string;
      /** Open or navigate the tab without showing it. */
      readonly background: boolean;
    }
  | { readonly action: "window"; readonly appId: string }
  | { readonly action: "external" };

const EXTERNAL: LinkTarget = { action: "external" };

// Google prefixes a path with the signed-in account's index or a Workspace domain, ahead of the segment that names the app.
const LOCATION = /^https?:\/\/(?<host>[^/?#:]+)(?::\d+)?(?<path>\/[^?#]*)?/iu;
const ACCOUNT_PREFIX = /^\/(?:u\/\d+|a\/[^/]+)(?=\/)/u;

const locate = (
  url: string
): { readonly host: string; readonly segment: string } | null => {
  const match = LOCATION.exec(url);
  const host = match?.groups?.host?.toLowerCase();
  if (host === undefined) {
    return null;
  }
  const path = (match?.groups?.path ?? "/").replace(ACCOUNT_PREFIX, "");
  const [, segment = ""] = path.split("/");
  return { host, segment };
};

const onHost = (host: string, claimed: string) =>
  host === claimed || host.endsWith(`.${claimed}`);

/** The catalog entry a URL belongs to; a host claimed with a path segment wins over the bare host. */
export const appOfUrl = (
  url: string,
  catalog: readonly App[]
): App | undefined => {
  const location = locate(url);
  if (location === null) {
    return undefined;
  }
  let best: { readonly app: App; readonly score: number } | undefined;
  for (const app of catalog) {
    for (const claim of app.hosts) {
      const [host = "", segment] = claim.split("/");
      const score = segment === undefined ? 1 : 2;
      const matches =
        onHost(location.host, host) &&
        (segment === undefined || segment === location.segment);
      if (matches && (best === undefined || score > best.score)) {
        best = { app, score };
      }
    }
  }
  return best?.app;
};

const hostOf = (url: string) => locate(url)?.host;

/** Where a link followed in a pane goes. */
export const resolveLinkTarget = (
  url: string,
  context: LinkContext
): LinkTarget => {
  const { catalog, settings, from, disposition = "default" } = context;
  const app = appOfUrl(url, catalog);
  if (app === undefined) {
    return EXTERNAL;
  }
  if (
    app.id === from.appId &&
    hostOf(url) === hostOf(from.url) &&
    (disposition === "inPlace" || disposition === "default")
  ) {
    return { action: "samePane" };
  }
  if (!settings.openInApp || settings.excludedApps.includes(app.id)) {
    return EXTERNAL;
  }
  const existing = orderedTabs(context.tabs, context.groups, from.profileId)
    .flatMap(rowTabs)
    .find((tab) => tab.appId === app.id);
  const background = disposition === "background";
  if (!isSingleInstance(app)) {
    const windowed =
      disposition === "window" ||
      settings.mode === "windows" ||
      app.openBehavior === "window";
    if (windowed) {
      return { action: "window", appId: app.id };
    }
  }
  return existing === undefined
    ? { action: "newTab", appId: app.id, background }
    : { action: "newTab", appId: app.id, background, tabId: existing.id };
};
