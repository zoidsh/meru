import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { ReactNode } from "react";
import { DownloadHistoryList } from "@/components/download-history";
import { FindInPage } from "@/components/find-in-page";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useFindInPageStore } from "@/lib/stores";
import type { PlaygroundComponentId } from "./components";

/**
 * `FindInPage` takes its state as props, and in the app the titlebar is the
 * composition root that reads the store and wires them up. The playground
 * supplies the same root, so the store and the events driving it stay the real
 * ones — see the matching container in `components/app-titlebar.tsx`.
 */
function FindInPageControls() {
  const isActive = useFindInPageStore((state) => state.isActive);
  const activeMatch = useFindInPageStore((state) => state.activeMatch);
  const totalMatches = useFindInPageStore((state) => state.totalMatches);
  const deactivate = useFindInPageStore((state) => state.deactivate);

  return (
    <FindInPage
      isActive={isActive}
      activeMatch={activeMatch}
      totalMatches={totalMatches}
      onFind={(text, options) => {
        ipc.main.send("findInPage", text, options);
      }}
      onClose={deactivate}
    />
  );
}

/** One renderer per catalog entry, which the type here is what enforces. */
export const playgroundComponentRenderers: Record<PlaygroundComponentId, () => ReactNode> = {
  downloadHistoryList: () => <DownloadHistoryList />,
  recentDownloadHistoryList: () => (
    <DownloadHistoryList limit={MAX_RECENT_DOWNLOAD_HISTORY_ITEMS} />
  ),
  findInPage: () => <FindInPageControls />,
  licenseKeyRequiredBanner: () => <LicenseKeyRequiredBanner />,
  verticalTabs: () => <VerticalTabs />,
};
