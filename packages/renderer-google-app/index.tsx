import { ipc } from "@meru/shared/renderer/ipc";
import { ms } from "@meru/shared/ms";
import { renderApp } from "@meru/shared/renderer/react";
import { AccountBadge } from "@meru/ui/components/account-badge";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarPageTitle,
  TitlebarRight,
} from "@meru/ui/components/titlebar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = setTimeout(() => setCopied(false), ms("1.5s"));

    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <TitlebarIconButton
      title="Copy URL"
      onClick={() => {
        ipc.main.send("googleApp.copyUrl");
        setCopied(true);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </TitlebarIconButton>
  );
}

function App() {
  const [navigationState, setNavigationState] = useState<{
    canGoBack: boolean;
    canGoForward: boolean;
  }>();

  const [pageTitle, setPageTitle] = useState("");

  const { data: account } = useQuery({
    queryKey: ["googleApp.account"],
    queryFn: () => ipc.main.invoke("googleApp.getAccount"),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    return ipc.renderer.on("googleApp.navigationStateChanged", (_event, state) => {
      setNavigationState(state);
    });
  }, []);

  useEffect(() => {
    return ipc.renderer.on("googleApp.pageTitleChanged", (_event, title) => {
      setPageTitle(title);
    });
  }, []);

  return (
    <Titlebar>
      <TitlebarLeft>
        <TitlebarButtonGroup>
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
          <ReloadButton />
        </TitlebarButtonGroup>
        {account && <AccountBadge label={account.label} color={account.color} />}
        <TitlebarPageTitle>{pageTitle}</TitlebarPageTitle>
      </TitlebarLeft>
      <TitlebarRight>
        <TitlebarButtonGroup>
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
