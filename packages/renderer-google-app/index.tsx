import { ipc } from "@meru/shared/renderer/ipc";
import { useCopied } from "@meru/shared/renderer/hooks";
import { renderApp } from "@meru/shared/renderer/react";
import { AccountBadge } from "@meru/ui/components/account-badge";
import { FindInPage } from "@meru/ui/components/find-in-page";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarPageTitle,
  TitlebarRight,
} from "@meru/ui/components/titlebar";
import { useConfig } from "@meru/shared/renderer/react-query";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "wouter";
import { GoogleAppIcon } from "@meru/ui/components/google-app-icon";
import type { GoogleAppsPinnedApp } from "@meru/shared/types";

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
      title="Recent Download History"
    >
      <DownloadIcon />
    </TitlebarIconButton>
  );
}

function ReloadButton() {
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const unsubscribe = ipc.renderer.on("googleApp.loadingStateChanged", (_event, isLoading) => {
      setLoading(isLoading);
    });

    ipc.main.invoke("googleApp.getLoadingState").then(setLoading);

    return unsubscribe;
  }, []);

  return (
    <TitlebarIconButton
      title={loading ? "Stop" : "Reload"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        ipc.main.send(loading ? "googleApp.stop" : "googleApp.reload");
      }}
    >
      {loading ? (
        hovered ? (
          <XIcon />
        ) : (
          <LoaderCircleIcon className="animate-spin" />
        )
      ) : (
        <RotateCwIcon />
      )}
    </TitlebarIconButton>
  );
}

function CopyUrlButton() {
  const { copied, markCopied } = useCopied();

  return (
    <TitlebarIconButton
      title="Copy URL"
      onClick={() => {
        ipc.main.send("googleApp.copyUrl");
        markCopied();
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </TitlebarIconButton>
  );
}

function NavigationButtons() {
  const [navigationState, setNavigationState] = useState<{
    canGoBack: boolean;
    canGoForward: boolean;
  }>();

  useEffect(() => {
    return ipc.renderer.on("googleApp.navigationStateChanged", (_event, state) => {
      setNavigationState(state);
    });
  }, []);

  return (
    <>
      <TitlebarIconButton
        title="Back"
        disabled={!navigationState?.canGoBack}
        onClick={() => {
          ipc.main.send("googleApp.goBack");
        }}
      >
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title="Forward"
        disabled={!navigationState?.canGoForward}
        onClick={() => {
          ipc.main.send("googleApp.goForward");
        }}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
    </>
  );
}

function PageTitle() {
  const [pageTitle, setPageTitle] = useState("");

  useEffect(() => {
    return ipc.renderer.on("googleApp.pageTitleChanged", (_event, title) => {
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

function App() {
  const { config } = useConfig();

  const [searchParams] = useSearchParams();

  const account = config?.accounts.find(
    (accountConfig) => accountConfig.id === searchParams.get("accountId"),
  );

  const googleApp = searchParams.get("googleApp") as GoogleAppsPinnedApp | null;

  return (
    <Titlebar>
      <TitlebarLeft>
        <TitlebarButtonGroup>
          <NavigationButtons />
          <ReloadButton />
        </TitlebarButtonGroup>
        {config && config.accounts.length > 1 && account && (
          <AccountBadge label={account.label} color={account.color} />
        )}
        <div className="flex items-center gap-1">
          {googleApp && <GoogleAppIcon app={googleApp} className="size-3.5" />}
          <PageTitle />
        </div>
      </TitlebarLeft>
      <TitlebarRight>
        <FindInPageControls />
        <TitlebarButtonGroup>
          <RecentDownloadHistoryButton />
          <CopyUrlButton />
          <TitlebarIconButton
            title="Open in Browser"
            onClick={() => {
              ipc.main.send("googleApp.openInBrowser");
            }}
          >
            <ExternalLinkIcon />
          </TitlebarIconButton>
        </TitlebarButtonGroup>
      </TitlebarRight>
    </Titlebar>
  );
}

renderApp(App);
