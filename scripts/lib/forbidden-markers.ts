/**
 * Text that must never appear in a production build's output: what only a
 * development build may hold. Add to it whatever else must stay out, such as a
 * development signing key or a stub server's address.
 */
export const FORBIDDEN_IN_PROD: readonly { marker: string; why: string }[] = [
  {
    marker: "MERU_DEV_SERVER_URL",
    why: "a production build must never load the shell from a dev server",
  },
  {
    marker: "MERU_DEV_CSP_NONCE",
    why: "the dev server's nonce belongs to development builds",
  },
  {
    marker: "'nonce-",
    why: "the development content security policy must be compiled out",
  },
  {
    marker: "onHeadersReceived",
    why: "only a development build rewrites a dev server's headers",
  },
  {
    marker: "toggleDevTools",
    why: "only a development build offers the developer tools in its menu",
  },
];

/** What only the end-to-end suite's build may hold. */
export const FORBIDDEN_IN_RELEASE: readonly { marker: string; why: string }[] =
  [
    {
      marker: "MERU_TEST_BACKGROUND",
      why: "only the end-to-end build may be kept from ever activating",
    },
    {
      marker: "MERU_TEST_APP_URLS",
      why: "only the end-to-end build may load stand-ins in place of the apps",
    },
    {
      marker: "meruTestNotifications",
      why: "only the end-to-end build may capture notifications in place of showing them",
    },
    {
      marker: "meruTestTray",
      why: "only the end-to-end build may capture its tray in place of showing one",
    },
    {
      marker: "meruTestClipboard",
      why: "only the end-to-end build may capture clipboard writes in place of making them",
    },
    {
      marker: "meruTestSounds",
      why: "only the end-to-end build may capture sounds in place of playing them",
    },
    {
      marker: "meruTestBadge",
      why: "only the end-to-end build may capture the unread badge in place of showing it",
    },
    {
      marker: "meruTestGmailPage",
      why: "only the end-to-end build may capture what Gmail's pages report",
    },
    {
      marker: "meruTestSettings",
      why: "only the end-to-end build may switch settings from outside the app",
    },
  ];

export interface OutputFile {
  path: string;
  contents: string;
}

export interface MarkerHit {
  path: string;
  marker: string;
  why: string;
}

export const findForbiddenMarkers = (
  files: readonly OutputFile[],
  markers: readonly { marker: string; why: string }[]
): MarkerHit[] =>
  files.flatMap((file) =>
    markers
      .filter(({ marker }) => file.contents.includes(marker))
      .map(({ marker, why }) => ({ path: file.path, marker, why }))
  );
