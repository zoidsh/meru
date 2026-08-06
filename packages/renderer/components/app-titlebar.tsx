import { accountColorsMap } from "@meru/shared/accounts";
import { WEBSITE_URL } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { useConfig } from "@meru/shared/renderer/react-query";
import { bookmarkableWorkspaceApps } from "@meru/shared/workspace-apps";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { FindInPage as UiFindInPage } from "@meru/ui/components/find-in-page";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarDropdownMenu,
  TitlebarDropdownMenuItem,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarNavigationControls,
} from "@meru/ui/components/titlebar";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { cn } from "@meru/ui/lib/utils";
import {
  BriefcaseIcon,
  CircleAlertIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  InboxIcon,
  LayoutGridIcon,
  MailSearchIcon,
  MoonIcon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";
import {
  useAccountsStore,
  useAppUpdaterStore,
  useFindInPageStore,
  useSettingsStore,
  useTabsStore,
  useTrialStore,
} from "../lib/stores";

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

function WorkspaceAppsLauncher() {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!config || !isLicenseKeyValid || config["workspaceApps.bookmarkedApps"].length === 0) {
    return;
  }

  return (
    <TitlebarButtonGroup>
      <TitlebarDropdownMenu
        title="Workspace Apps"
        icon={<LayoutGridIcon />}
        isOpen={isMenuOpen}
        onOpenChange={setIsMenuOpen}
      >
        {config["workspaceApps.bookmarkedApps"].map((app) => (
          <TitlebarDropdownMenuItem
            key={app}
            title={bookmarkableWorkspaceApps[app]}
            onClick={(event) => {
              ipc.main.send("workspaceApps.openApp", app, getModifierOpenBehavior(event));
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                ipc.main.send("workspaceApps.openApp", app, "backgroundTab");

                setIsMenuOpen(false);
              }
            }}
          >
            <WorkspaceAppIcon app={app} className="size-4" />
          </TitlebarDropdownMenuItem>
        ))}
      </TitlebarDropdownMenu>
    </TitlebarButtonGroup>
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
        "group relative h-7 border-yellow-600/60 text-yellow-600/60 transition draggable-none hover:border-transparent hover:bg-secondary hover:text-secondary-foreground",
        {
          "border-red-600/60 text-red-600/60": trialDaysLeft <= 3,
        },
      )}
    >
      <a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
        <span className="fade-out group-hover:opacity-0">
          Pro trial ends in{" "}
          {trialDaysLeft >= 2
            ? `${trialDaysLeft} days`
            : trialDaysLeft >= 1
              ? `${trialDaysLeft} day`
              : "less than a day"}
        </span>
        <span className="absolute inset-0 items-center justify-center opacity-0 fade-in group-hover:inline-flex group-hover:opacity-100">
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

  return (
    <UiFindInPage
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

export function AppTitlebar() {
  const accounts = useAccountsStore((state) => state.accounts);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const accountsTabs = useTabsStore((state) => state.accountsTabs);

  const activeTab = accountsTabs
    .find((accountTabs) => accountTabs.accountId === selectedAccount?.config.id)
    ?.tabs.find((tab) => tab.active);

  const [matchUnifiedInboxRoute] = useRoute("/main/unified-inbox");

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

  const shouldShowUnifiedInboxButton =
    isLicenseKeyValid && config["unifiedInbox.enabled"] && accounts.length > 1;

  const shouldShowSavedSearchesButton =
    config["gmail.savedSearches"].length > 0 && Boolean(config.licenseKey);

  const shouldShowOutOfOfficeButton =
    accounts.length === 1 &&
    Boolean(accounts[0]?.gmail.outOfOffice) &&
    config["gmail.hideOutOfOfficeBanner"] &&
    isLicenseKeyValid;

  const renderAccounts = () => {
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
          <div className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#ec3128] px-1 text-[0.5rem] leading-none font-normal text-white">
            {account.gmail.unreadCount.toLocaleString()}
          </div>
        ) : null}
      </Button>
    ));
  };

  const renderContent = () => {
    if (isAppUpdateDetailsOpen) {
      return (
        <div className="flex flex-1 items-center justify-center gap-4 text-xs">
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

    const accountButtons = renderAccounts();

    return (
      <>
        <TitlebarLeft>
          <WorkspaceAppsLauncher />
          <TitlebarButtonGroup>
            <TitlebarNavigationControls
              canGoBack={Boolean(activeTab?.navigationHistory.canGoBack)}
              canGoForward={Boolean(activeTab?.navigationHistory.canGoForward)}
              isLoading={Boolean(activeTab?.loading)}
              disabled={matchUnifiedInboxRoute}
              onGoBack={() => {
                ipc.main.send("workspaceApp.goBack");
              }}
              onGoForward={() => {
                ipc.main.send("workspaceApp.goForward");
              }}
              onReload={() => {
                ipc.main.send("workspaceApp.reload");
              }}
              onStop={() => {
                ipc.main.send("workspaceApp.stop");
              }}
            />
          </TitlebarButtonGroup>
          {(shouldShowUnifiedInboxButton || shouldShowSavedSearchesButton) && (
            <TitlebarButtonGroup>
              {shouldShowUnifiedInboxButton && (
                <Button
                  variant={matchUnifiedInboxRoute ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7 draggable-none"
                  onClick={() => {
                    navigate("/main/unified-inbox");

                    ipc.main.send("settings.toggleIsOpen", true);
                  }}
                  title="Unified Inbox"
                >
                  <InboxIcon />
                </Button>
              )}
              {shouldShowSavedSearchesButton && (
                <TitlebarDropdownMenu
                  title="Saved Searches"
                  icon={<MailSearchIcon />}
                  disabled={matchUnifiedInboxRoute}
                  isOpen={isGmailSavedSearchesOpen}
                  onOpenChange={setIsGmailSavedSearchesOpen}
                >
                  {config["gmail.savedSearches"].map((savedSearch) => (
                    <TitlebarDropdownMenuItem
                      key={savedSearch.id}
                      onClick={() => {
                        ipc.main.send("gmail.search", savedSearch.query);
                      }}
                    >
                      {savedSearch.label}
                    </TitlebarDropdownMenuItem>
                  ))}
                </TitlebarDropdownMenu>
              )}
            </TitlebarButtonGroup>
          )}
          {(shouldShowOutOfOfficeButton || accountButtons) && (
            <TitlebarButtonGroup>
              {shouldShowOutOfOfficeButton && (
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
              {accountButtons}
            </TitlebarButtonGroup>
          )}
        </TitlebarLeft>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Trial />
            <FindInPage />
            <RecentDownloadHistoryButton />
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
