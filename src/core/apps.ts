import { isWebUrl } from "./google-redirect.ts";

/**
 * A workspace app: what a tab of it is called, where it starts, the URLs it
 * claims and whether a profile may have more than one tab of it. Its icon is
 * drawn by the shell from its id. Adding an app is an entry here and an icon.
 */
export interface App {
  id: AppId;
  /** Google's product name, which is not translated. */
  name: string;
  home: string;
  claims: readonly Claim[];
  singleInstance: boolean;
  /**
   * Whether a tab of it reopens where it was, when the app still claims that
   * URL, rather than at its home.
   */
  restoresUrl: boolean;
  /**
   * Permissions its pages get beyond what every app's do, by Electron's
   * names; see `allowsPermission`.
   */
  permissions: readonly string[];
}

/**
 * An origin, and optionally the first path segments under it that the claim
 * is limited to. A claim limited to paths wins over one that is not, which is
 * how Sheets and Slides take their part of `docs.google.com` from Docs.
 */
export interface Claim {
  origin: string;
  paths?: readonly string[];
}

export const APP_IDS = [
  "gmail",
  "calendar",
  "drive",
  "docs",
  "sheets",
  "slides",
  "meet",
] as const;

export type AppId = (typeof APP_IDS)[number];

// v3 claims each app's own subdomain of google.com and its usercontent one.
const googleSubdomain = (
  subdomain: string,
  paths?: readonly string[]
): Claim[] =>
  [
    `https://${subdomain}.google.com`,
    `https://${subdomain}.usercontent.google.com`,
  ].map((origin) => (paths ? { origin, paths } : { origin }));

const entry = (id: AppId, name: string, claims: readonly Claim[]): App => ({
  id,
  name,
  home: claims[0]?.origin ?? "",
  claims,
  singleInstance: false,
  restoresUrl: true,
  permissions: [],
});

/**
 * The apps a run may open tabs of: every one with `workspaceApps`, else
 * Gmail alone.
 */
export const entitledApps = (
  apps: readonly App[],
  workspaceApps: boolean
): readonly App[] =>
  workspaceApps ? apps : apps.filter((app) => app.id === "gmail");

/** Tabs & Google Apps' two settings, as the run reads them. */
export interface AppOpening {
  openAppsInMeru: boolean;
  appsInDefaultBrowser: readonly string[];
}

/**
 * Whether a new tab of the app, from a link or New tab, opens in Meru rather
 * than the default browser. Gmail always does, as in v3.
 */
export const opensInMeru = (
  app: Pick<App, "id">,
  { openAppsInMeru, appsInDefaultBrowser }: AppOpening
) =>
  app.id === "gmail" ||
  (openAppsInMeru && !appsInDefaultBrowser.includes(app.id));

/** Docs, Sheets and Slides share `docs.google.com`, told apart by path. */
export const APPS: readonly App[] = [
  {
    ...entry("gmail", "Gmail", googleSubdomain("mail")),
    home: "https://mail.google.com/mail/u/0",
    singleInstance: true,
    // As v3: Gmail always opens at the inbox.
    restoresUrl: false,
    // Its own web notifications would double the ones main makes from the feed.
    permissions: [],
  },
  {
    ...entry("calendar", "Calendar", googleSubdomain("calendar")),
    permissions: ["notifications"],
  },
  entry("drive", "Drive", googleSubdomain("drive")),
  entry("docs", "Docs", [
    ...googleSubdomain("docs"),
    ...googleSubdomain("docs", ["document"]),
  ]),
  entry("sheets", "Sheets", [
    ...googleSubdomain("sheets"),
    ...googleSubdomain("docs", ["spreadsheets"]),
  ]),
  entry("slides", "Slides", [
    ...googleSubdomain("slides"),
    ...googleSubdomain("docs", ["presentation"]),
  ]),
  {
    ...entry("meet", "Meet", googleSubdomain("meet")),
    // Unprompted, as v3: macOS asks for the camera and microphone itself.
    permissions: ["notifications", "media", "speaker-selection"],
  },
];

export const isAppId = (value: string): value is AppId =>
  (APP_IDS as readonly string[]).includes(value);

/**
 * The registry the suite's build uses: each app given a stand-in URL starts
 * there and claims that origin alone; the rest claim nothing.
 */
export const standInApps = (
  urls: Partial<Record<AppId, string>>
): readonly App[] =>
  APPS.map((registered) => {
    const url = urls[registered.id];

    return url
      ? { ...registered, home: url, claims: [{ origin: new URL(url).origin }] }
      : { ...registered, claims: [] };
  });

/** Where a restored tab loads first. */
export const restoreUrl = (apps: readonly App[], app: App, url: string) =>
  app.restoresUrl && appForUrl(apps, url)?.id === app.id ? url : app.home;

/**
 * The first path segment, after the `/u/<n>` or `/a/<domain>` a signed-in
 * Google URL may start with.
 */
const firstSegment = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const [head, , third] = segments;

  return head === "u" || head === "a" ? third : head;
};

/**
 * The app that claims a URL, by its parsed origin, so a look-alike host or a
 * claimed host in the path or the credentials claims nothing.
 */
export const appForUrl = (
  apps: readonly App[],
  url: string
): App | undefined => {
  const parsed = URL.parse(url);

  if (!parsed || !isWebUrl(parsed)) {
    return;
  }

  const segment = firstSegment(parsed.pathname);
  let fallback: App | undefined;

  for (const candidate of apps) {
    for (const claim of candidate.claims) {
      if (claim.origin !== parsed.origin) {
        continue;
      }

      if (!claim.paths) {
        fallback ??= candidate;
      } else if (segment !== undefined && claim.paths.includes(segment)) {
        return candidate;
      }
    }
  }

  return fallback;
};

export const findApp = (apps: readonly App[], id: string) =>
  apps.find((candidate) => candidate.id === id);
