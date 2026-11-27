/**
 * Text that must never appear in a production build's output: what only a
 * development build may hold. Add to it whatever else must stay out, such as a
 * development signing key or a stub server's address.
 */
export const FORBIDDEN_IN_PROD: readonly { marker: string; why: string }[] = [
  {
    marker: "MERU_DEV_SERVER_URL",
    why: "a production build must never load a renderer from a dev server",
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
      marker: "meru development entitlement key",
      why: "only development and the end-to-end build may sign with the development key, whose seed is public",
    },
    {
      marker: "ubpt7-KnQIvden48nE3Ku1XnK8_6Xi0CqcSn1yvF-MI",
      why: "a release must trust no token the development key signs",
    },
    {
      marker: "MERU_STUB_OFFLINE",
      why: "only development and the end-to-end build hold the entitlement API's stand-in",
    },
    {
      marker: "MERU_TEST_ENTITLEMENT",
      why: "only the end-to-end build may start a trial its test asked for",
    },
    {
      marker: "meruTestEntitlement",
      why: "only the end-to-end build may expose the entitlement to the suite",
    },
    {
      marker: "MERU_TEST_BACKGROUND",
      why: "only the end-to-end build may be kept from ever activating",
    },
    {
      marker: "MERU_TEST_APP_URLS",
      why: "only the end-to-end build may load stand-ins in place of the apps",
    },
    {
      marker: "MERU_E2E_REFUSED",
      why: "only the end-to-end build may refuse every request off this machine",
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
      marker: "meruTestDownloadFiles",
      why: "only the end-to-end build may save downloads in a folder of its own and capture what it opens in place of opening it",
    },
    {
      marker: "meruTestDownloadSignals",
      why: "only the end-to-end build may capture Dock and taskbar progress in place of showing it",
    },
    {
      marker: "meruTestOpenedExternally",
      why: "only the end-to-end build may capture what it would open in the default browser in place of opening it",
    },
    {
      marker: "meruTestWithheld",
      why: "only the end-to-end build may answer Electron's dialogs and openers as canceled in place of showing or opening anything",
    },
    {
      marker: "MERU_E2E_WITHHELD",
      why: "only the end-to-end build may log the Electron calls it withheld",
    },
    {
      marker: "meruTestClipboard",
      why: "only the end-to-end build may capture clipboard writes in place of making them",
    },
    {
      marker: "meruTestContextMenus",
      why: "only the end-to-end build may capture its menus in place of showing them",
    },
    {
      marker: "meruTestPageActions",
      why: "only the end-to-end build may record what a page's menu would do to the clipboard, the spelling dictionary or the screen in place of doing it",
    },
    {
      marker: "meruTestSounds",
      why: "only the end-to-end build may record the sounds it plays through no output device",
    },
    {
      marker: "meruTestBadge",
      why: "only the end-to-end build may capture the unread badge in place of showing it",
    },
    {
      marker: "meruTestDock",
      why: "only the end-to-end build may capture the Dock icon's hiding in place of hiding it",
    },
    {
      marker: "meruTestFolderPicker",
      why: "only the end-to-end build may answer the folder picker in place of showing it",
    },
    {
      marker: "meruTestSaveDialog",
      why: "only the end-to-end build may answer the save dialog in place of showing it",
    },
    {
      marker: "meruTestLoginItem",
      why: "only the end-to-end build may record the login item in place of setting it",
    },
    {
      marker: "meruTestLinkPrompts",
      why: "only the end-to-end build may answer the link prompt in place of showing it",
    },
    {
      marker: "meruTestDefaultBrowser",
      why: "only the end-to-end build may say Meru is the default browser in place of asking the system",
    },
    {
      marker: "meruTestGmailPage",
      why: "only the end-to-end build may capture what Gmail's pages report",
    },
    {
      marker: "meruTestSettings",
      why: "only the end-to-end build may switch settings from outside the app",
    },
    {
      marker: "meruTestUpdater",
      why: "only the end-to-end build may stand in for the updater, which a test drives",
    },
    {
      marker: "meruTestScreenSources",
      why: "only the end-to-end build may list stand-in screens and windows to share",
    },
    {
      marker: "meruTestReleases",
      why: "only the end-to-end build may stand in for GitHub's list of releases, which a test answers",
    },
    {
      marker: "meruTestRelaunch",
      why: "only the end-to-end build may end the app in place of relaunching it",
    },
    {
      marker: "en-XA",
      why: "only the end-to-end build may show its pseudo-language",
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
