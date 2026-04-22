import { ipc } from "@meru/shared/renderer/ipc";
import { accountColorsMap } from "@meru/shared/accounts";
import { WEBSITE_URL } from "@meru/shared/constants";
import { type DownloadItem, googleAppsPinnedApps } from "@meru/shared/types";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { Input } from "@meru/ui/components/input";
import { Titlebar, TitlebarIconButton, TitlebarLeft } from "@meru/ui/components/titlebar";
import { cn } from "@meru/ui/lib/utils";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleXIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FileCheckIcon,
  InboxIcon,
  MailSearchIcon,
  MoonIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { navigate, useHashLocation } from "wouter/use-hash-location";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig } from "@meru/shared/renderer/react-query";
import {
  useAccountsStore,
  useAppUpdaterStore,
  useDownloadsStore,
  useFindInPageStore,
  useSettingsStore,
  useTrialStore,
} from "../lib/stores";
import { GoogleAppIcon } from "./google-app-icon";
import { useRoute } from "wouter";

function RecentlyDownloadedItem({ item }: { item: DownloadItem }) {
  const [fadeOut, setFadeOut] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleAnimationEnd = () => {
      if (useDownloadsStore.getState().itemCompleted === item.id) {
        useDownloadsStore.setState({
          itemCompleted: null,
        });
      }
    };

    const timer = setTimeout(() => {
      buttonRef.current?.addEventListener("animationend", handleAnimationEnd);

      setFadeOut(true);
    }, 10000);

    return () => {
      clearTimeout(timer);

      buttonRef.current?.removeEventListener("animationend", handleAnimationEnd);
    };
  }, [item]);

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="sm"
      className={cn("max-w-56 animate-in fade-in", {
        "animate-out fade-out": fadeOut,
      })}
      onClick={() => {
        ipc.main.send("downloads.openFile", item);

        useDownloadsStore.setState({
          itemCompleted: null,
        });
      }}
    >
      <FileCheckIcon />
      <div className="truncate">{item.fileName}</div>
    </Button>
  );
}

function Download() {
  const [_location] = useHashLocation();

  const { config } = useConfig();

  if (!config) {
    return;
  }

  const completedDownloadItem = useDownloadsStore(
    (state) =>
      (state.itemCompleted &&
        config?.["downloads.history"].find((item) => item.id === state.itemCompleted)) ||
      null,
  );

  return (
    <div className="draggable-none flex items-center gap-1">
      {completedDownloadItem && <RecentlyDownloadedItem item={completedDownloadItem} />}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          ipc.main.send("downloads.toggleRecentDownloadHistoryPopup");
        }}
        onMouseEnter={() => {
          ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", false);
        }}
        onMouseLeave={() => {
          ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", true);
        }}
        title="Download History"
      >
        <DownloadIcon />
      </Button>
    </div>
  );
}

function Trial() {
  const trialDaysLeft = useTrialStore((state) => state.daysLeft);

  if (!trialDaysLeft) {
    return;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-7 text-yellow-600/60 border-yellow-600/60 hover:border-transparent hover:bg-secondary hover:text-secondary-foreground transition draggable-none group relative",
        {
          "text-red-600/60 border-red-600/60": trialDaysLeft <= 3,
        },
      )}
    >
      <a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
        <span className="group-hover:opacity-0 fade-out">
          Pro trial ends in{" "}
          {trialDaysLeft >= 2
            ? `${trialDaysLeft} days`
            : trialDaysLeft >= 1
              ? `${trialDaysLeft} day`
              : "less than a day"}
        </span>
        <span className="opacity-0 absolute inset-0 group-hover:opacity-100 group-hover:inline-flex items-center justify-center fade-in">
          Upgrade to Pro
        </span>
      </a>
    </Badge>
  );
}

function FindInPage() {
  const isActive = useFindInPageStore((state) => state.isActive);
  const activeMatch = useFindInPageStore((state) => state.activeMatch);
  const totalMatches = useFindInPageStore((state) => state.totalMatches);
  const deactivate = useFindInPageStore((state) => state.deactivate);

  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");

  const debouncedOnChange = useDebouncedCallback((text) => {
    ipc.main.send("findInPage", text, { findNext: true });
  }, 250);

  useEffect(() => {
    if (isActive && text) {
      ipc.main.send("findInPage", text, { findNext: true });

      if (inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isActive]);

  if (!isActive) {
    return;
  }

  return (
    <div className="draggable-none flex items-center gap-4">
      <div className="relative">
        <Input
          ref={inputRef}
          className="h-7"
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);

            debouncedOnChange(event.target.value);
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case "Enter": {
                ipc.main.send("findInPage", text, {
                  forward: true,
                  findNext: false,
                });

                break;
              }
              case "Escape": {
                deactivate();

                break;
              }
            }
          }}
        />
        <div className="absolute top-0 right-0 bottom-0 text-xs text-muted-foreground flex items-center p-2.5">
          {activeMatch}/{totalMatches}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            ipc.main.send("findInPage", text, {
              forward: false,
              findNext: false,
            });
          }}
          title="Find Previous Match"
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            ipc.main.send("findInPage", text, { findNext: false });
          }}
          title="Find Next Match"
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={deactivate} title="Close Find in Page">
          <XIcon />
        </Button>
      </div>
    </div>
  );
}

function DoNotDisturb() {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config || !isLicenseKeyValid) {
    return;
  }

  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("doNotDisturb.toggle");
      }}
      onContextMenu={(event) => {
        event.preventDefault();

        ipc.main.send("doNotDisturb.showOptions");
      }}
      title="Do Not Disturb"
    >
      <MoonIcon
        className={cn({
          "text-violet-600": config["doNotDisturb.enabled"],
        })}
      />
    </TitlebarIconButton>
  );
}

function PinnedGoogleApps() {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config || !isLicenseKeyValid || config["googleApps.pinnedApps"].length === 0) {
    return;
  }

  return (
    <div className="flex gap-2 border-r pr-2 not-first:border-l not-first:pl-2">
      {config["googleApps.pinnedApps"].map((app) => (
        <TitlebarIconButton
          key={app}
          onClick={() => {
            ipc.main.send("googleApps.openApp", app);
          }}
          title={googleAppsPinnedApps[app]}
        >
          <GoogleAppIcon app={app} />
        </TitlebarIconButton>
      ))}
    </div>
  );
}

export function AppTitlebar() {
  const accounts = useAccountsStore((state) => state.accounts);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const [matchUnifiedInboxRoute] = useRoute("/unified-inbox");

  const appUpdateVersion = useAppUpdaterStore((state) => state.version);
  const dismissAppUpdate = useAppUpdaterStore((state) => state.dismiss);

  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  const { config } = useConfig();

  const [isGmailSavedSearchesOpen, setIsGmailSavedSearchesOpen] = useState(false);

  const [isAppUpdateDetailsOpen, setIsAppUpdateDetailsOpen] = useState(false);

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config || !accounts) {
    return;
  }

  const renderAccounts = () => {
    if (isGmailSavedSearchesOpen) {
      return config["gmail.savedSearches"].map((savedSearch) => (
        <Button
          key={savedSearch.id}
          variant="outline"
          size="sm"
          className="draggable-none"
          onClick={() => {
            ipc.main.send("gmail.search", savedSearch.query);
          }}
        >
          {savedSearch.label}
        </Button>
      ));
    }

    if (accounts.length === 1) {
      return;
    }

    return accounts.map((account) => (
      <Button
        key={account.config.id}
        variant={
          account.config.selected && !matchUnifiedInboxRoute && !isSettingsOpen
            ? "secondary"
            : "ghost"
        }
        size="sm"
        className="draggable-none"
        onClick={() => {
          ipc.main.send("settings.toggleIsOpen", false);

          ipc.main.send("accounts.selectAccount", account.config.id);
        }}
      >
        {account.config.color && (
          <div
            className={cn("size-2 rounded-full", accountColorsMap[account.config.color].className)}
          />
        )}
        {account.gmail.outOfOffice && isLicenseKeyValid && <BriefcaseIcon />}
        {account.config.label}
        {account.gmail.attentionRequired && <CircleAlertIcon className="text-yellow-400" />}
        {!account.gmail.attentionRequired &&
        config["accounts.unreadBadge"] &&
        account.gmail.unreadCount ? (
          <div className="bg-[#ec3128] font-normal text-[0.5rem] leading-none text-white min-w-3.5 h-3.5 px-1 flex items-center justify-center rounded-full">
            {account.gmail.unreadCount.toLocaleString()}
          </div>
        ) : null}
      </Button>
    ));
  };

  const renderContent = () => {
    if (isAppUpdateDetailsOpen) {
      return (
        <div className="flex-1 flex justify-center items-center text-xs gap-4">
          <div>Meru {appUpdateVersion} is available and ready to install</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.quitAndInstall");
              }}
            >
              Restart Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="draggable-none"
              onClick={() => {
                dismissAppUpdate();
                setIsAppUpdateDetailsOpen(false);
              }}
            >
              Later
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.openVersionHistory");
              }}
            >
              What's New?
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <TitlebarLeft>
          <Button
            variant="ghost"
            size="icon-sm"
            className="draggable-none"
            onClick={() => {
              ipc.main.send("gmail.moveNavigationHistory", "back");
            }}
            disabled={matchUnifiedInboxRoute || !selectedAccount?.gmail.navigationHistory.canGoBack}
            title="Go Back"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="draggable-none"
            onClick={() => {
              ipc.main.send("gmail.moveNavigationHistory", "forward");
            }}
            disabled={
              matchUnifiedInboxRoute || !selectedAccount?.gmail.navigationHistory.canGoForward
            }
            title="Go Forward"
          >
            <ArrowRightIcon />
          </Button>
          {isLicenseKeyValid && config["unifiedInbox.enabled"] && accounts.length > 1 && (
            <Button
              variant={matchUnifiedInboxRoute ? "secondary" : "ghost"}
              size="icon"
              className="size-7 draggable-none"
              onClick={() => {
                navigate("/unified-inbox");

                ipc.main.send("settings.toggleIsOpen", true);

                setIsGmailSavedSearchesOpen(false);
              }}
              title="Unified Inbox"
            >
              <InboxIcon />
            </Button>
          )}
          {config["gmail.savedSearches"].length > 0 && config.licenseKey && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="draggable-none"
              onClick={() => {
                setIsGmailSavedSearchesOpen((isOpen) => !isOpen);
              }}
              title="Saved Searches"
              disabled={matchUnifiedInboxRoute}
            >
              {isGmailSavedSearchesOpen ? <CircleXIcon /> : <MailSearchIcon />}
            </Button>
          )}
          {accounts.length === 1 &&
            accounts[0]?.gmail.outOfOffice &&
            config["gmail.hideOutOfOfficeBanner"] &&
            isLicenseKeyValid && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="draggable-none"
                title="Out of Office"
                onClick={() => {
                  ipc.main.send("gmail.navigateTo", "settings");
                }}
              >
                <BriefcaseIcon />
              </Button>
            )}
          {renderAccounts()}
        </TitlebarLeft>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Trial />
            <FindInPage />
            <PinnedGoogleApps />
            <Download />
            <DoNotDisturb />
          </div>
          {appUpdateVersion && (
            <Button
              size="sm"
              className="draggable-none"
              onClick={() => {
                setIsAppUpdateDetailsOpen(true);
              }}
            >
              <SparklesIcon /> Update Available
            </Button>
          )}
          {window.electron.process.platform !== "darwin" && (
            <div className="draggable-none">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  ipc.main.send("titleBar.toggleAppMenu");
                }}
              >
                <EllipsisVerticalIcon />
              </Button>
            </div>
          )}
        </div>
      </>
    );
  };

  return <Titlebar>{renderContent()}</Titlebar>;
}
