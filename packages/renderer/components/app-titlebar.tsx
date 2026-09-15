import { accountColorsMap } from "@meru/shared/accounts";
import { APP_TITLEBAR_HEIGHT, WEBSITE_URL } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountInstances } from "@meru/shared/schemas";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import {
  BookOpenIcon,
  BriefcaseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  InboxIcon,
  MailSearchIcon,
  MoonIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { FindInPage as UiFindInPage } from "@/components/find-in-page";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarDropdownMenu,
  TitlebarDropdownMenuItem,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarNavigationControls,
  TitlebarRightOverlay,
  TitlebarTitle,
} from "@/components/titlebar";
import { UnreadCountBadge } from "@/components/unread-count-badge";
import { WorkspaceAppsLauncher } from "@/components/workspace-apps-launcher";
import { useIsLicenseKeyValid, useVerticalTabs } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";
import { HOST_HANDOVER_FADE_CLASS_NAME } from "@/lib/utils";
import {
  useAccountsStore,
  useAppUpdaterStore,
  useFindInPageStore,
  useTrialStore,
} from "../lib/stores";

function BookmarksButton() {
  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("bookmarks.togglePopup", "titlebar");
      }}
      onMouseEnter={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true);
      }}
      title="Show bookmarks"
    >
      <BookOpenIcon />
    </TitlebarIconButton>
  );
}

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

function AppMenuButton({ className }: { className?: string }) {
  if (window.electron.process.platform === "darwin") {
    return;
  }

  return (
    <div className={cn("draggable-none", className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          ipc.main.send("titleBar.toggleAppMenu");
        }}
        title="App menu"
      >
        <EllipsisVerticalIcon />
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
          Upgrade to Meru Pro
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

  if (!config || !isLicenseKeyValid || !config["doNotDisturb.showTitlebarButton"]) {
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
      title={config["doNotDisturb.enabled"] ? "Turn Do Not Disturb off" : "Turn Do Not Disturb on"}
    >
      <MoonIcon
        className={cn({
          "text-violet-600": config["doNotDisturb.enabled"],
        })}
      />
    </TitlebarIconButton>
  );
}

/** How much of what is on screen an arrow click keeps, so the move stays readable. */
const ACCOUNT_ROW_SCROLL_OVERLAP = 40;

/** The shortest an arrow click moves, for a row with barely anything visible. */
const ACCOUNT_ROW_MINIMUM_SCROLL = 80;

/**
 * Both of the row's overlays are measured rather than assumed: the right-hand
 * controls come and go with the trial, an available update, Do Not Disturb and
 * the launcher, and the left arrow is only there once the row has left its
 * start.
 *
 * The ref carries the same number to the callbacks that have to read it without
 * being rebuilt every time it changes.
 */
function useMeasuredWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0);

  const widthRef = useRef(0);

  useEffect(() => {
    const record = (measured: number) => {
      widthRef.current = measured;

      setWidth(measured);
    };

    if (!element) {
      record(0);

      return;
    }

    const measure = () => {
      record(element.getBoundingClientRect().width);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [element]);

  return [width, widthRef] as const;
}

/**
 * The account row's scroll state: which way it can still go, how far an arrow
 * takes it, and how wide the two overlays that sit over its ends are.
 *
 * Neither overlay takes room from the row, so scrolling never changes the row's
 * width. The row reserves their widths instead: as scroll padding at both ends,
 * so selecting an account never parks it underneath one of them, and as a margin
 * after the last button, so that button can be scrolled clear of the controls on
 * the right.
 */
function useAccountRow(accounts: AccountInstances) {
  const [rowElement, setRowElement] = useState<HTMLDivElement | null>(null);

  const [rightControlsElement, setRightControlsElement] = useState<HTMLDivElement | null>(null);

  const [leftArrowElement, setLeftArrowElement] = useState<HTMLDivElement | null>(null);

  const [rightControlsWidth, rightControlsWidthRef] = useMeasuredWidth(rightControlsElement);

  const [leftArrowWidth, leftArrowWidthRef] = useMeasuredWidth(leftArrowElement);

  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const [canScrollRight, setCanScrollRight] = useState(false);

  const selectedAccountId = accounts.find((account) => account.config.selected)?.config.id;

  /*
   * The account the row owes a scroll to, and how it should get there.
   *
   * The debt outlives the scroll that pays it, because one scroll is never
   * enough. The row is first laid out before its overlays have been measured,
   * so the margin and the scroll padding that reserve their widths are both
   * still zero, and the pushed account list then adds the unread badges and
   * attention icons that widen every button. Each of those moves the row's
   * contents out from under a scroll that has already landed, and an account
   * that was on screen between two of them is off it again after the next.
   *
   * So it is not paid off by the account looking right for a moment. It is
   * cleared by someone scrolling the row themselves, which is the only thing
   * that says they would rather be looking somewhere else.
   */
  const pendingScrollRef = useRef<{ accountId: string; behavior: ScrollBehavior } | null>(null);

  const alignedRowRef = useRef<HTMLDivElement | null>(null);

  const updateScrollState = useCallback(() => {
    if (!rowElement) {
      return;
    }

    setCanScrollLeft(rowElement.scrollLeft > 1);

    setCanScrollRight(rowElement.scrollWidth - rowElement.clientWidth - rowElement.scrollLeft > 1);
  }, [rowElement]);

  /**
   * The button of the account the row owes a scroll to, unless it is already
   * clear of both overlays.
   *
   * Clear of them, rather than merely inside the row: they sit over the row's
   * ends rather than beside them, so a button under one of them is inside the
   * row and still not on screen.
   */
  const readButtonToAlign = useCallback(() => {
    const pending = pendingScrollRef.current;

    if (!pending || !rowElement) {
      return null;
    }

    const button = rowElement.querySelector(`[data-account-id="${CSS.escape(pending.accountId)}"]`);

    if (!button) {
      return null;
    }

    const buttonRect = button.getBoundingClientRect();

    const rowRect = rowElement.getBoundingClientRect();

    const isInTheClear =
      buttonRect.left >= rowRect.left + leftArrowWidthRef.current - 1 &&
      buttonRect.right <= rowRect.right - rightControlsWidthRef.current + 1;

    return isInTheClear ? null : { button, behavior: pending.behavior };
  }, [rowElement, leftArrowWidthRef, rightControlsWidthRef]);

  const alignRow = useCallback(() => {
    updateScrollState();

    const pending = readButtonToAlign();

    pending?.button.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: pending.behavior,
    });
  }, [updateScrollState, readButtonToAlign]);

  useEffect(() => {
    if (!rowElement) {
      setCanScrollLeft(false);

      setCanScrollRight(false);

      return;
    }

    alignRow();

    rowElement.addEventListener("scroll", updateScrollState);

    const resizeObserver = new ResizeObserver(alignRow);

    resizeObserver.observe(rowElement);

    let isObserving = true;

    // The row is laid out in a fallback font first, and every button in it is a
    // different width once Inter arrives.
    document.fonts.ready.then(() => {
      if (isObserving) {
        alignRow();
      }
    });

    return () => {
      isObserving = false;

      rowElement.removeEventListener("scroll", updateScrollState);

      resizeObserver.disconnect();
    };
  }, [rowElement, updateScrollState, alignRow]);

  useEffect(() => {
    if (!rowElement) {
      return;
    }

    const forgetPendingScroll = () => {
      pendingScrollRef.current = null;
    };

    // Registered here rather than as a React `onWheel`, because turning a
    // vertical wheel into a horizontal scroll takes `preventDefault`, and React
    // attaches its wheel listener passively.
    const handleWheel = (event: WheelEvent) => {
      forgetPendingScroll();

      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      rowElement.scrollLeft += event.deltaY;

      event.preventDefault();
    };

    /*
     * The other two ways the row moves under someone, neither of which is a
     * wheel: tabbing between the account buttons, which Chromium scrolls the
     * focused one into view for, and a touch pan on Windows. Left standing, the
     * alignment would take the row back off them at the next pushed account
     * list.
     */
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        forgetPendingScroll();
      }
    };

    rowElement.addEventListener("wheel", handleWheel, { passive: false });

    rowElement.addEventListener("focusin", forgetPendingScroll);

    rowElement.addEventListener("pointerdown", handlePointerDown);

    return () => {
      rowElement.removeEventListener("wheel", handleWheel);

      rowElement.removeEventListener("focusin", forgetPendingScroll);

      rowElement.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [rowElement]);

  // Keyed on the selection rather than called from the click handler, because a
  // menu item, an accelerator, a mouse button and Select Next Account all select
  // an account without the row hearing anything.
  useEffect(() => {
    if (!rowElement || !selectedAccountId) {
      return;
    }

    // Instant the first time a row is laid out, so an account chosen before
    // Meru was on screen is simply already there; smooth for a selection
    // someone watched happen. A row coming back, such as on the way out of
    // settings, is a first time again.
    const isFirstLayout = alignedRowRef.current !== rowElement;

    alignedRowRef.current = rowElement;

    pendingScrollRef.current = {
      accountId: selectedAccountId,
      behavior: isFirstLayout ? "instant" : "smooth",
    };

    alignRow();
  }, [rowElement, selectedAccountId, alignRow]);

  /*
   * The row's own size does not change when a button grows an unread badge or an
   * attention icon, when the last button's margin follows the controls on the
   * right, or when the scroll padding does, so none of it reaches the
   * `ResizeObserver` above. The pushed account list and the measured widths are
   * what say the row's contents moved under it.
   */
  useEffect(() => {
    alignRow();
  }, [alignRow, accounts, leftArrowWidth, rightControlsWidth]);

  const scrollBy = (direction: 1 | -1) => {
    if (!rowElement) {
      return;
    }

    pendingScrollRef.current = null;

    const distance = Math.max(
      ACCOUNT_ROW_MINIMUM_SCROLL,
      rowElement.clientWidth - rightControlsWidth - leftArrowWidth - ACCOUNT_ROW_SCROLL_OVERLAP,
    );

    rowElement.scrollBy({ left: direction * distance });
  };

  return {
    setRowElement,
    setRightControlsElement,
    setLeftArrowElement,
    rightControlsWidth,
    leftArrowWidth,
    canScrollLeft,
    canScrollRight,
    scrollBy,
  };
}

export function AppTitlebar() {
  const accounts = useAccountsStore((state) => state.accounts);

  const accountRow = useAccountRow(accounts);

  const { tabs: selectedAccountTabs, width: verticalTabsWidth } = useVerticalTabs();

  const activeTab = selectedAccountTabs.find((tab) => tab.active);

  const [location] = useLocation();

  const appUpdateVersion = useAppUpdaterStore((state) => state.version);
  const dismissAppUpdate = useAppUpdaterStore((state) => state.dismiss);

  const { config } = useConfig();

  const [isGmailSavedSearchesOpen, setIsGmailSavedSearchesOpen] = useState(false);

  const [isAppUpdateDetailsOpen, setIsAppUpdateDetailsOpen] = useState(false);

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (location.startsWith("/settings/")) {
    return (
      <Titlebar>
        <TitlebarTitle>Settings</TitlebarTitle>
        <AppMenuButton className="ml-auto" />
      </Titlebar>
    );
  }

  if (!config || !accounts) {
    return;
  }

  const isAccountLocation = location === "/";

  const isUnifiedInboxLocation = location === "/unified-inbox";

  const shouldShowWorkspaceAppsLauncher =
    isLicenseKeyValid && config["workspaceApps.launcherApps"].length > 0;

  const shouldShowBookmarksButton = config["workspaceApps.showBookmarksButton"];

  // On `auto` the vertical tabs strip hosts the launcher and the bookmarks
  // button whenever it is there, so that opening another app or a bookmarked
  // page stays in the same place as switching between tabs. `sidebar` keeps the
  // strip there for them, so the width is never 0; `titlebar` keeps them here
  // whatever the strip does.
  const areLauncherAndBookmarksPlacementedByVerticalTabs =
    config["workspaceApps.launcherAndBookmarksPlacement"] !== "titlebar" && verticalTabsWidth > 0;

  const shouldShowUnifiedInboxButton =
    isLicenseKeyValid && config["unifiedInbox.enabled"] && accounts.length > 1;

  const shouldShowSavedSearchesButton =
    config["gmail.savedSearches"].length > 0 && Boolean(config.licenseKey);

  const isWorkspaceAppTabActive = Boolean(activeTab?.app && activeTab.app !== "gmail");

  const shouldShowOutOfOfficeButton =
    accounts.length === 1 &&
    Boolean(accounts[0]?.gmail.outOfOffice) &&
    config["gmail.hideOutOfOfficeBanner"] &&
    isLicenseKeyValid;

  const renderAccounts = () => {
    if (accounts.length === 1) {
      return;
    }

    return accounts.map((account, index) => (
      <Button
        key={account.config.id}
        data-account-id={account.config.id}
        variant={account.config.selected && isAccountLocation ? "secondary" : "ghost"}
        size="sm"
        className="draggable-none"
        style={
          index === accounts.length - 1 ? { marginRight: accountRow.rightControlsWidth } : undefined
        }
        onClick={() => {
          navigate("/");

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
          <UnreadCountBadge unreadCount={account.gmail.unreadCount} />
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
              Restart now
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
              What's new
            </Button>
          </div>
        </div>
      );
    }

    const accountButtons = renderAccounts();

    return (
      <>
        <TitlebarLeft>
          <TitlebarButtonGroup className="shrink-0">
            <TitlebarNavigationControls
              canGoBack={Boolean(activeTab?.navigationHistory.canGoBack)}
              canGoForward={Boolean(activeTab?.navigationHistory.canGoForward)}
              isLoading={Boolean(activeTab?.loading)}
              disabled={isUnifiedInboxLocation}
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
          {shouldShowUnifiedInboxButton && (
            <TitlebarButtonGroup className="shrink-0">
              <Button
                variant={isUnifiedInboxLocation ? "secondary" : "ghost"}
                size="icon"
                className="size-7 draggable-none"
                onClick={() => {
                  navigate("/unified-inbox");
                }}
                title="Open unified inbox"
              >
                <InboxIcon />
              </Button>
            </TitlebarButtonGroup>
          )}
          {(shouldShowOutOfOfficeButton || accountButtons) && (
            <TitlebarButtonGroup className="min-w-0 flex-1">
              {shouldShowOutOfOfficeButton && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="draggable-none"
                  title="Open Gmail settings to turn off out of office"
                  onClick={() => {
                    ipc.main.send("gmail.navigateTo", "settings");
                  }}
                >
                  <BriefcaseIcon />
                </Button>
              )}
              {accountButtons && (
                <div className="relative flex min-w-0 flex-1 items-center">
                  {/*
                   * Left draggable, unlike the buttons inside it, so the gap
                   * after the last account still drags the window.
                   */}
                  <div
                    ref={accountRow.setRowElement}
                    className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden motion-safe:scroll-smooth"
                    style={{
                      height: APP_TITLEBAR_HEIGHT,
                      scrollPaddingLeft: accountRow.leftArrowWidth,
                      scrollPaddingRight: accountRow.rightControlsWidth,
                    }}
                  >
                    {accountButtons}
                  </div>
                  {/*
                   * Over the row rather than beside it, like the controls at the
                   * other end: an arrow that took room from the row would change
                   * the row's width by appearing, after the browser had already
                   * chosen where the scroll that made it appear stops.
                   */}
                  {accountRow.canScrollLeft && (
                    <div
                      ref={accountRow.setLeftArrowElement}
                      className="absolute top-0 left-0 flex items-center bg-background after:pointer-events-none after:absolute after:top-0 after:bottom-0 after:left-full after:w-6 after:bg-linear-to-r after:from-background after:to-transparent"
                      style={{ height: APP_TITLEBAR_HEIGHT }}
                    >
                      <TitlebarIconButton
                        className="text-muted-foreground"
                        title="Scroll accounts left"
                        onClick={() => {
                          accountRow.scrollBy(-1);
                        }}
                      >
                        <ChevronLeftIcon />
                      </TitlebarIconButton>
                    </div>
                  )}
                </div>
              )}
            </TitlebarButtonGroup>
          )}
        </TitlebarLeft>
        <TitlebarRightOverlay
          ref={accountRow.setRightControlsElement}
          isFadeVisible={accountRow.canScrollRight}
        >
          {accountRow.canScrollRight && (
            <TitlebarIconButton
              className="text-muted-foreground"
              title="Scroll accounts right"
              onClick={() => {
                accountRow.scrollBy(1);
              }}
            >
              <ChevronRightIcon />
            </TitlebarIconButton>
          )}
          <div className="flex items-center gap-2">
            <Trial />
            <FindInPage />
            {/*
             * The group goes rather than emptying out, because an empty group
             * would still spend the gap between the controls either side of it.
             */}
            {isLicenseKeyValid &&
              (shouldShowWorkspaceAppsLauncher || shouldShowBookmarksButton) && (
                <TitlebarButtonGroup
                  className={cn(
                    HOST_HANDOVER_FADE_CLASS_NAME,
                    areLauncherAndBookmarksPlacementedByVerticalTabs && "hidden opacity-0",
                  )}
                >
                  {shouldShowWorkspaceAppsLauncher && (
                    <WorkspaceAppsLauncher
                      launcherApps={config["workspaceApps.launcherApps"]}
                      display={config["workspaceApps.launcherDisplay"]}
                      disabled={isUnifiedInboxLocation}
                    />
                  )}
                  {shouldShowBookmarksButton && <BookmarksButton />}
                </TitlebarButtonGroup>
              )}
            {shouldShowSavedSearchesButton && (
              <TitlebarDropdownMenu
                title="Show saved searches"
                icon={<MailSearchIcon />}
                side="left"
                disabled={isUnifiedInboxLocation || isWorkspaceAppTabActive}
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
              <SparklesIcon /> Update available
            </Button>
          )}
          <AppMenuButton />
        </TitlebarRightOverlay>
      </>
    );
  };

  return <Titlebar>{renderContent()}</Titlebar>;
}
