import { useTranslation } from "@meru/i18n/provider";
import { ipc } from "@meru/renderer-lib/ipc";
import { accountColorsMap } from "@meru/shared/accounts";
import { APP_TITLEBAR_HEIGHT, WEBSITE_URL } from "@meru/shared/constants";
import { type DownloadItem, googleAppsPinnedApps } from "@meru/shared/types";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { Input } from "@meru/ui/components/input";
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
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { navigate, useHashLocation } from "wouter/use-hash-location";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig } from "@meru/renderer-lib/react-query";
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

function TitlebarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-sm" className={cn("draggable-none", className)} {...props} />
  );
}

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
  const { t } = useTranslation();

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
        title={t("titlebar.downloadHistory")}
      >
        <DownloadIcon />
      </Button>
    </div>
  );
}

function Trial() {
  const { t } = useTranslation();

  const trialDaysLeft = useTrialStore((state) => state.daysLeft);

  if (!trialDaysLeft) {
    return;
  }

  const endsLabel =
    trialDaysLeft >= 2
      ? t("titlebar.trialEndsIn", { count: trialDaysLeft })
      : trialDaysLeft >= 1
        ? t("titlebar.trialEndsInOneDay")
        : t("titlebar.trialEndsInLessThanDay");

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
        <span className="group-hover:opacity-0 fade-out">{endsLabel}</span>
        <span className="opacity-0 absolute inset-0 group-hover:opacity-100 group-hover:inline-flex items-center justify-center fade-in">
          {t("titlebar.upgradeToPro")}
        </span>
      </a>
    </Badge>
  );
}

function FindInPage() {
  const { t } = useTranslation();

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
          title={t("titlebar.findPrevious")}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            ipc.main.send("findInPage", text, { findNext: false });
          }}
          title={t("titlebar.findNext")}
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={deactivate} title={t("titlebar.closeFind")}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}

function DoNotDisturb() {
  const { t } = useTranslation();

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
      title={t("titlebar.doNotDisturb")}
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
  const { t } = useTranslation();

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
        <div className="h-full flex justify-center items-center text-xs gap-4">
          <div>{t("titlebar.updateAvailableMessage", { version: appUpdateVersion })}</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.quitAndInstall");
              }}
            >
              {t("titlebar.restartNow")}
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
              {t("titlebar.later")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.openVersionHistory");
              }}
            >
              {t("titlebar.whatsNew")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-end gap-4">
        <div className="flex-1 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="draggable-none"
            onClick={() => {
              ipc.main.send("gmail.moveNavigationHistory", "back");
            }}
            disabled={matchUnifiedInboxRoute || !selectedAccount?.gmail.navigationHistory.canGoBack}
            title={t("titlebar.goBack")}
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
            title={t("titlebar.goForward")}
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
              title={t("titlebar.unifiedInbox")}
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
              title={t("titlebar.savedSearches")}
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
                title={t("titlebar.outOfOffice")}
                onClick={() => {
                  ipc.main.send("gmail.navigateTo", "settings");
                }}
              >
                <BriefcaseIcon />
              </Button>
            )}
          {renderAccounts()}
        </div>
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
            <SparklesIcon /> {t("titlebar.updateAvailable")}
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
    );
  };

  return (
    <div
      className="relative bg-background border-b draggable select-none"
      style={{ height: APP_TITLEBAR_HEIGHT }}
    >
      <div
        className="absolute top-0 bottom-0 px-1.5"
        style={{
          left: "env(titlebar-area-x, 0)",
          width: "env(titlebar-area-width, 100%)",
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}
