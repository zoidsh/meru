import { ipc } from "@meru/shared/renderer/ipc";
import type { SupportedWorkspaceApp, WorkspaceAppBookmarkState } from "@meru/shared/workspace-apps";
import { cn } from "@meru/ui/lib/utils";
import { DownloadIcon, EllipsisVerticalIcon, StarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountBadge } from "@/components/account-badge";
import { ExtensionActions } from "@/components/extension-actions";
import { FindInPage } from "@/components/find-in-page";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarNavigationControls,
  TitlebarPageTitle,
  TitlebarRight,
} from "@/components/titlebar";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
import { renderApp } from "@/lib/react";
import { useConfig } from "@/lib/react-query";

function RecentDownloadHistoryButton() {
  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("downloads.toggleRecentDownloadHistoryPopup");
      }}
      onMouseEnter={() => {
        ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", true);
      }}
      title="Show recent download history"
    >
      <DownloadIcon />
    </TitlebarIconButton>
  );
}

/**
 * Saves the URL on display, or drops the bookmark holding it — filled while the
 * window sits on a bookmarked URL, empty as soon as it browses on. Bookmarking
 * is otherwise a tab context-menu action, which `New Windows` mode leaves no
 * way to reach.
 *
 * It sits first in the group on purpose: the group is anchored to the window's
 * right edge, so a button that comes and goes only shifts what precedes it, and
 * from here there is nothing to shift.
 */
function BookmarkButton({ workspaceAppId }: { workspaceAppId: string }) {
  const [bookmarkState, setBookmarkState] = useState<WorkspaceAppBookmarkState>({
    savable: false,
    bookmarked: false,
  });

  useEffect(() => {
    const unsubscribe = ipc.renderer.on("workspaceApp.bookmarkStateChanged", (_event, state) => {
      setBookmarkState(state);
    });

    ipc.main.invoke("workspaceApp.getBookmarkState", workspaceAppId).then(setBookmarkState);

    return unsubscribe;
  }, [workspaceAppId]);

  if (!bookmarkState.savable) {
    return;
  }

  return (
    <TitlebarIconButton
      title={bookmarkState.bookmarked ? "Remove bookmark" : "Bookmark"}
      onClick={() => {
        ipc.main.send("workspaceApp.toggleBookmark", workspaceAppId);
      }}
    >
      <StarIcon className={cn(bookmarkState.bookmarked && "fill-current")} />
    </TitlebarIconButton>
  );
}

function NavigationControls({ workspaceAppId }: { workspaceAppId: string }) {
  const [navigationState, setNavigationState] = useState({
    canGoBack: false,
    canGoForward: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return ipc.renderer.on("workspaceApp.navigationStateChanged", (_event, state) => {
      setNavigationState(state);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = ipc.renderer.on("workspaceApp.loadingStateChanged", (_event, loading) => {
      setIsLoading(loading);
    });

    ipc.main.invoke("workspaceApp.getLoadingState", workspaceAppId).then(setIsLoading);

    return unsubscribe;
  }, [workspaceAppId]);

  return (
    <TitlebarNavigationControls
      canGoBack={navigationState.canGoBack}
      canGoForward={navigationState.canGoForward}
      isLoading={isLoading}
      onGoBack={() => {
        ipc.main.send("workspaceApp.goBack", workspaceAppId);
      }}
      onGoForward={() => {
        ipc.main.send("workspaceApp.goForward", workspaceAppId);
      }}
      onReload={() => {
        ipc.main.send("workspaceApp.reload", workspaceAppId);
      }}
      onStop={() => {
        ipc.main.send("workspaceApp.stop", workspaceAppId);
      }}
    />
  );
}

function PageTitle() {
  const [pageTitle, setPageTitle] = useState("");

  useEffect(() => {
    return ipc.renderer.on("workspaceApp.pageTitleChanged", (_event, title) => {
      setPageTitle(title);
    });
  }, []);

  return <TitlebarPageTitle>{pageTitle}</TitlebarPageTitle>;
}

function FindInPageControls() {
  const [findInPageState, setFindInPageState] = useState({
    isActive: false,
    activeMatch: 0,
    totalMatches: 0,
  });

  useEffect(() => {
    return ipc.renderer.on("findInPage.activate", () => {
      setFindInPageState((state) => ({ ...state, isActive: true }));
    });
  }, []);

  useEffect(() => {
    return ipc.renderer.on("findInPage.result", (_event, { activeMatch, totalMatches }) => {
      setFindInPageState((state) => ({ ...state, activeMatch, totalMatches }));
    });
  }, []);

  return (
    <FindInPage
      isActive={findInPageState.isActive}
      activeMatch={findInPageState.activeMatch}
      totalMatches={findInPageState.totalMatches}
      onFind={(text, options) => {
        ipc.main.send("findInPage", text, options);
      }}
      onClose={() => {
        ipc.main.send("findInPage", null);

        setFindInPageState((state) => ({ ...state, isActive: false }));
      }}
    />
  );
}

function WorkspaceApp() {
  const { config } = useConfig();

  const searchParams = new URLSearchParams(window.location.search);

  const account = config?.accounts.find(
    (accountConfig) => accountConfig.id === searchParams.get("accountId"),
  );

  const workspaceApp = searchParams.get("workspaceApp") as SupportedWorkspaceApp | null;

  const workspaceAppId = searchParams.get("workspaceAppId");

  if (!workspaceAppId) {
    return;
  }

  return (
    <Titlebar>
      <TitlebarLeft>
        <TitlebarButtonGroup>
          <NavigationControls workspaceAppId={workspaceAppId} />
        </TitlebarButtonGroup>
        {config && config.accounts.length > 1 && account && (
          <AccountBadge label={account.label} color={account.color} />
        )}
        <div className="flex items-center gap-1">
          {workspaceApp && <WorkspaceAppIcon app={workspaceApp} className="size-3.5" />}
          <PageTitle />
        </div>
      </TitlebarLeft>
      <TitlebarRight>
        <FindInPageControls />
        <ExtensionActions />
        <TitlebarButtonGroup>
          <BookmarkButton workspaceAppId={workspaceAppId} />
          <RecentDownloadHistoryButton />
          <TitlebarIconButton
            title="More options"
            onClick={() => {
              ipc.main.send("workspaceApp.showMenu", workspaceAppId);
            }}
          >
            <EllipsisVerticalIcon />
          </TitlebarIconButton>
        </TitlebarButtonGroup>
      </TitlebarRight>
    </Titlebar>
  );
}

renderApp(WorkspaceApp);
