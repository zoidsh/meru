/** What Browsing data's Delete… can delete of a profile. */
export interface BrowsingDataKinds {
  /** Cookies and other site data, which signs the profile out. */
  cookies: boolean;
  /** Cached images and files. */
  cache: boolean;
}

/** One of the kinds of data Electron's `Session.clearData` names. */
export type BrowsingDataType =
  | "cache"
  | "cookies"
  | "localStorage"
  | "indexedDB"
  | "serviceWorkers"
  | "fileSystems"
  | "backgroundFetch";

/**
 * The session's data types each kind covers, in v3's order. Cookies and other
 * site data leave out `webSQL`, which Electron accepts and ignores.
 */
export const browsingDataTypes = ({
  cookies,
  cache,
}: BrowsingDataKinds): BrowsingDataType[] => [
  ...(cache ? (["cache"] as const) : []),
  ...(cookies
    ? ([
        "cookies",
        "localStorage",
        "indexedDB",
        "serviceWorkers",
        "fileSystems",
        "backgroundFetch",
      ] as const)
    : []),
];
