import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";

type PlaygroundComponent = {
  name: string;
  /** Where the component itself lives, so the file is one search away. */
  source: string;
  /** `fill` hands over the whole preview area, as the app's own layout does. */
  layout: "padded" | "fill";
};

/**
 * The catalog of what the playground can render. An entry is one call site
 * rather than one component: props are code, so a component rendered with
 * different props in different places earns an entry for each. A scenario picks
 * an entry by id and supplies everything the component reads through IPC.
 *
 * This holds no React, because the shell renders the picker beside the preview
 * and must not pull the renderer's modules into a page with no fake bridge
 * under it. `render.tsx` is where an id becomes a component.
 */
export const playgroundComponents = {
  downloadHistoryList: {
    name: "DownloadHistoryList",
    source: "components/download-history.tsx",
    layout: "padded",
  },
  recentDownloadHistoryList: {
    name: `DownloadHistoryList, limited to ${MAX_RECENT_DOWNLOAD_HISTORY_ITEMS}`,
    source: "components/download-history.tsx",
    layout: "padded",
  },
  findInPage: {
    name: "FindInPage",
    source: "components/find-in-page.tsx",
    layout: "padded",
  },
  licenseKeyRequiredBanner: {
    name: "LicenseKeyRequiredBanner",
    source: "components/license-key-required-banner.tsx",
    layout: "padded",
  },
  verticalTabs: {
    name: "VerticalTabs",
    source: "components/vertical-tabs.tsx",
    layout: "fill",
  },
} satisfies Record<string, PlaygroundComponent>;

export type PlaygroundComponentId = keyof typeof playgroundComponents;
