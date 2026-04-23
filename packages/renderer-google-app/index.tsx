import { ipc } from "@meru/shared/renderer/ipc";
import { ms } from "@meru/shared/ms";
import { renderApp } from "@meru/shared/renderer/react";
import { AccountBadge } from "@meru/ui/components/account-badge";
import {
  Titlebar,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarRight,
} from "@meru/ui/components/titlebar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  RotateCwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

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

  return (
    <Titlebar>
      <TitlebarLeft>
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
        <TitlebarIconButton
          title="Reload"
          onClick={() => {
            ipc.main.send("googleApp.reload");
          }}
        >
          <RotateCwIcon />
        </TitlebarIconButton>
      </TitlebarLeft>
      <TitlebarRight>
        {account && <AccountBadge label={account.label} color={account.color} />}
        <CopyUrlButton />
        <TitlebarIconButton
          title="Open in Browser"
          onClick={() => {
            ipc.main.send("googleApp.openInBrowser");
          }}
        >
          <ExternalLinkIcon />
        </TitlebarIconButton>
      </TitlebarRight>
    </Titlebar>
  );
}

renderApp(App);
