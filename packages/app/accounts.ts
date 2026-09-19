import { randomUUID } from "node:crypto";
import { platform } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import type { AccountConfig, AccountConfigs } from "@meru/shared/schemas";
import {
  getVerticalTabsWidth,
  getVisibleVerticalTabs,
  type VerticalTabsSessionWidth,
} from "@meru/shared/tabs";
import { net, powerMonitor, session } from "electron";
import { Account } from "./account";
import { config } from "./config";
import { extensions } from "./extensions";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { isWindowedTab } from "./tabs";
import { WorkspaceApp } from "./workspace-app";

const HIBERNATION_SWEEP_INTERVAL = ms("1m");

const NETWORK_RECOVERY_SWEEP_INTERVAL = ms("5s");

class Accounts {
  instances: Map<string, Account> = new Map();

  init() {
    this.repairAccountConfigs();

    for (const accountConfig of this.selectLaunchableAccountConfigs(config.get("accounts"))) {
      const account = new Account(accountConfig);

      this.instances.set(accountConfig.id, account);
    }

    if (!platform.isMacOS) {
      config.onDidChange("spellchecker.languages", () => {
        for (const account of accounts.instances.values()) {
          account.setSpellCheckerLanguages();
        }
      });
    }

    config.onDidChange("gmail.labelColors", () => {
      for (const account of accounts.instances.values()) {
        account.gmail.applyLabelColors();
      }
    });

    // A width chosen in settings speaks for every account, so it takes back the
    // strips a button press had set aside for this run — otherwise picking a
    // width there would leave them where they stand and read as broken.
    config.onDidChange("verticalTabs.width", () => {
      for (const account of accounts.instances.values()) {
        account.verticalTabsWidth = null;
      }

      accounts.updateAllViewBounds();

      accounts.sendAccountsChangedToRenderer();
    });

    config.onDidChange("verticalTabs.showWindows", () => {
      accounts.updateAllViewBounds();
    });

    config.onDidChange("workspaceApps.mode", () => {
      accounts.updateAllViewBounds();
    });

    // `sidebar` holds the strip open where the other placements let it go, so
    // switching between them moves every view sideways.
    config.onDidChange("workspaceApps.launcherAndBookmarksPlacement", () => {
      accounts.updateAllViewBounds();
    });

    config.onDidChange("workspaceApps.zoomFactors", () => {
      WorkspaceApp.applyPersistedZoomFactors();

      for (const account of accounts.instances.values()) {
        account.gmail.applyPersistedZoomFactor();
      }
    });

    // Every tick reads the hibernation settings afresh, so changing them takes
    // effect on the next sweep without a listener of their own.
    setInterval(() => {
      for (const account of accounts.instances.values()) {
        account.tabs.hibernateIdleTabs();
      }
    }, HIBERNATION_SWEEP_INTERVAL);

    powerMonitor.on("resume", () => {
      accounts.resyncInboxes();
    });

    /*
     * Polled rather than driven by an event, because Electron's main process
     * has no network-change signal and the renderer's `online` would need a
     * channel of its own to get here. `net.isOnline()` reads Chromium's
     * network change notifier, so the tick costs nothing.
     */
    let wasOnline = net.isOnline();

    setInterval(() => {
      const isOnline = net.isOnline();

      const cameBack = isOnline && !wasOnline;

      wasOnline = isOnline;

      if (cameBack) {
        accounts.resyncInboxes();
      }
    }, NETWORK_RECOVERY_SWEEP_INTERVAL);
  }

  /*
   * Gmail learns about new mail over a push channel that reconnects with
   * exponential backoff after sleep or a network change, and can stay down for
   * minutes. Until it is back, nothing but Gmail's own five-minute timer
   * reaches the view.
   */
  private resyncInboxes() {
    for (const account of this.instances.values()) {
      account.gmail.resyncInbox();
    }
  }

  sendInboxesToRenderer() {
    for (const account of this.instances.values()) {
      account.gmail.sendInboxToRenderer();
    }
  }

  async createViews() {
    /*
     * Registered before the views are created rather than after, because
     * `createView` resolves only once Gmail's page has loaded and this method is
     * not awaited. Every window resize in between was reaching nobody, leaving
     * the views at the size they were created with — and a maximize, unlike a
     * drag, has no second resize afterwards to correct them.
     */
    this.registerWindowListeners();

    const accounts = this.getAccounts().sort((a, b) => {
      if (a.config.selected && !b.config.selected) {
        return 1;
      }

      if (!a.config.selected && b.config.selected) {
        return -1;
      }

      return 0;
    });

    await Promise.all(
      accounts.map((account) =>
        account.instance.gmail.createView({
          webPreferences: {
            backgroundThrottling: false,
          },
        }),
      ),
    );

    for (const account of accounts) {
      account.instance.gmail.view.webContents.setBackgroundThrottling(true);
    }

    for (const account of accounts) {
      account.instance.tabs.loadLaunchTabs();
    }
  }

  private registerWindowListeners() {
    main.window.on("resize", () => {
      this.updateAllViewBounds();
    });

    // When window is closed/minimized, the account views sometimes don't render after showing/restoring window
    main.window.on("show", () => {
      this.refreshSelectedAccountView();
    });

    main.window.on("restore", () => {
      this.refreshSelectedAccountView();
    });
  }

  getVerticalTabsWidth() {
    const selectedAccount = this.getSelectedAccount();

    return getVerticalTabsWidth(
      getVisibleVerticalTabs(selectedAccount.instance.tabs.serialize(), {
        workspaceAppsMode: config.get("workspaceApps.mode"),
        showWindows: config.get("verticalTabs.showWindows"),
      }),
      {
        configuredWidth: config.get("verticalTabs.width"),
        sessionWidth: selectedAccount.instance.verticalTabsWidth,
        launcherAndBookmarksPlacement: config.get("workspaceApps.launcherAndBookmarksPlacement"),
      },
    );
  }

  /** `null` hands the width back to the setting, `auto` included. */
  setVerticalTabsWidth(accountId: AccountConfig["id"], width: VerticalTabsSessionWidth | null) {
    this.getAccount(accountId).instance.verticalTabsWidth = width;

    this.updateAllViewBounds();

    this.sendAccountsChangedToRenderer();
  }

  updateAllViewBounds() {
    for (const account of this.instances.values()) {
      for (const tab of account.tabs.tabs) {
        tab.updateViewBounds?.();
      }
    }
  }

  refreshSelectedAccountView() {
    const activeTab = this.getSelectedAccount().instance.tabs.activeTab;

    if (!activeTab.view) {
      return;
    }

    main.window.contentView.removeChildView(activeTab.view);
    main.window.contentView.addChildView(activeTab.view);

    activeTab.updateViewBounds?.();

    if (main.location === "/") {
      activeTab.view.webContents.focus();
    }
  }

  /**
   * Two states leave the app with nothing to run on: every account disabled,
   * and a selection pointing at an account that no longer runs.
   * `getSelectedAccount()` throws on either, so they are repaired here rather
   * than tolerated everywhere.
   */
  private repairAccountConfigs() {
    const accountConfigs = config.get("accounts");

    let isRepaired = false;

    if (!licenseKey.isValid && accountConfigs.length > 1 && accountConfigs[0]?.selected === false) {
      for (const [index, accountConfig] of accountConfigs.entries()) {
        accountConfig.selected = index === 0;
      }

      isRepaired = true;
    }

    const firstAccountConfig = accountConfigs[0];

    if (!firstAccountConfig) {
      return;
    }

    if (this.selectLaunchableAccountConfigs(accountConfigs).length === 0) {
      firstAccountConfig.disabled = false;

      isRepaired = true;
    }

    const launchableAccountConfigs = this.selectLaunchableAccountConfigs(accountConfigs);

    const firstLaunchableAccountConfig = launchableAccountConfigs[0];

    if (
      firstLaunchableAccountConfig &&
      !launchableAccountConfigs.some((accountConfig) => accountConfig.selected)
    ) {
      for (const accountConfig of accountConfigs) {
        accountConfig.selected = accountConfig.id === firstLaunchableAccountConfig.id;
      }

      isRepaired = true;
    }

    if (isRepaired) {
      config.set("accounts", accountConfigs);
    }
  }

  /**
   * The accounts the app runs on, which is not everything the config holds. A
   * second account and a workspace app are both Pro, so the free version is
   * handed one account carrying no saved tabs — and every consumer reads them
   * from here, which is what keeps the gate off the paths that use a tab.
   * Restoring one, loading it on launch and waking a dormant one were each
   * ungated on their own, so a trial that ended left its pinned apps working
   * indefinitely.
   *
   * What the config holds is left alone: this slices what it returns, so
   * activating a license brings back the accounts and the tabs the user had.
   * Nothing written back to disk may be built from this list.
   */
  getAccountConfigs() {
    /*
     * Which accounts are disabled is read once, at launch, and the answer is
     * `instances`. Reading `disabled` here instead would let a toggle take
     * effect mid-session against an `instances` map fixed at launch: the
     * `accounts` change listeners run synchronously off `config.set`, and the
     * first of them to ask for an account Meru never constructed throws into
     * Electron's main-process error dialog.
     */
    return this.selectLicensedAccountConfigs(config.get("accounts")).filter((accountConfig) =>
      this.instances.has(accountConfig.id),
    );
  }

  /** The accounts Meru constructs at launch, which is what `instances` is built from. */
  private selectLaunchableAccountConfigs(accountConfigs: AccountConfigs) {
    return this.selectLicensedAccountConfigs(accountConfigs).filter(
      (accountConfig) => accountConfig.disabled !== true,
    );
  }

  /**
   * Taken before disabled accounts are: a license bought back is meant to bring
   * the same account to the front as it took away, whichever of them the user
   * has turned off since.
   */
  private selectLicensedAccountConfigs(accountConfigs: AccountConfigs) {
    if (licenseKey.isValid) {
      return accountConfigs;
    }

    return accountConfigs.slice(0, 1).map((accountConfig) => ({
      ...accountConfig,
      workspaceApps: {
        ...accountConfig.workspaceApps,
        savedTabs: [],
      },
    }));
  }

  getAccount(accountId: string) {
    const accountConfig = this.getAccountConfigs().find((account) => account.id === accountId);

    if (!accountConfig) {
      throw new Error("Could not find account config");
    }

    const instance = this.instances.get(accountId);

    if (!instance) {
      throw new Error("Could not find account instance");
    }

    return {
      config: accountConfig,
      instance,
    };
  }

  getAccounts() {
    return this.getAccountConfigs().map((accountConfig) => {
      const instance = this.instances.get(accountConfig.id);

      if (!instance) {
        throw new Error("Could not find account instance");
      }

      return {
        config: accountConfig,
        instance,
      };
    });
  }

  getSelectedAccount() {
    let selectedAccount: ReturnType<typeof this.getAccount> | undefined;

    for (const accountConfig of this.getAccountConfigs()) {
      if (accountConfig.selected) {
        selectedAccount = this.getAccount(accountConfig.id);

        break;
      }
    }

    if (!selectedAccount) {
      throw new Error("Could not find selected account");
    }

    return selectedAccount;
  }

  findInstanceByGmailWebContentsId(webContentsId: number) {
    for (const account of this.instances.values()) {
      if (account.gmail.view.webContents.id === webContentsId) {
        return account;
      }
    }
  }

  selectAccount(selectedAccountId: string) {
    // Written from what the config holds rather than from `getAccountConfigs`,
    // which is filtered down for the free version: selecting an account there
    // would have persisted that filtering, dropping every account past the
    // first and the saved tabs of the one that stayed.
    config.set(
      "accounts",
      config.get("accounts").map((accountConfig) => {
        return {
          ...accountConfig,
          selected: accountConfig.id === selectedAccountId,
        };
      }),
    );

    this.updateAllViewBounds();

    this.refreshSelectedAccountView();
  }

  selectPreviousAccount() {
    const accountConfigs = this.getAccountConfigs();

    const selectedAccountIndex = accountConfigs.findIndex(
      (accountConfig) => accountConfig.selected,
    );

    const previousAccount = accountConfigs.at(
      selectedAccountIndex === 0 ? -1 : selectedAccountIndex - 1,
    );

    if (!previousAccount) {
      throw new Error("Could not find previous account");
    }

    this.selectAccount(previousAccount.id);
  }

  selectNextAccount() {
    const accountConfigs = this.getAccountConfigs();

    const selectedAccountIndex = accountConfigs.findIndex(
      (accountConfig) => accountConfig.selected,
    );

    const nextAccount = accountConfigs.at(
      selectedAccountIndex === accountConfigs.length - 1 ? 0 : selectedAccountIndex + 1,
    );

    if (!nextAccount) {
      throw new Error("Could not find next account");
    }

    this.selectAccount(nextAccount.id);
  }

  addAccount(
    accountDetails: Pick<AccountConfig, "label" | "notifications" | "color"> & {
      gmail: Pick<AccountConfig["gmail"], "unreadBadge" | "unifiedInbox">;
    },
  ) {
    const createdAccount: AccountConfig = {
      ...accountDetails,
      id: randomUUID(),
      selected: false,
      gmail: {
        unreadBadge: accountDetails.gmail.unreadBadge,
        unifiedInbox: accountDetails.gmail.unifiedInbox,
        delegatedAccountId: null,
      },
      workspaceApps: {
        savedTabs: [],
        bookmarks: [],
      },
    };

    this.createAccountInstance(createdAccount);

    config.set("accounts", [...config.get("accounts"), createdAccount]);

    this.selectAccount(createdAccount.id);

    this.sendTabsChangedToRenderer();

    main.navigate("/");
  }

  /**
   * Builds an account and the view it runs in, and puts it where every consumer
   * looks for it. The view is created visible, so a caller reaching here from a
   * renderer page has to hide it again.
   */
  private createAccountInstance(accountConfig: AccountConfig) {
    const instance = new Account(accountConfig);

    instance.gmail.createView();

    this.instances.set(accountConfig.id, instance);

    return instance;
  }

  /**
   * Takes an account out of the running app. It leaves the session and its
   * extension data alone, which is what separates turning an account off from
   * removing it.
   */
  private teardownAccount(accountId: AccountConfig["id"]) {
    const instance = this.instances.get(accountId);

    if (!instance) {
      return;
    }

    instance.tabs.closeAll();

    WorkspaceApp.closeAccountInstances(accountId);

    instance.gmail.destroy();

    instance.destroy();

    this.instances.delete(accountId);
  }

  async removeAccount(selectedAccountId: string) {
    const instance = this.instances.get(selectedAccountId);

    if (instance) {
      this.teardownAccount(selectedAccountId);

      await instance.session.clearData();

      await extensions.clearSessionData(instance.session);
    } else {
      // An account that launched disabled was never constructed, so there is
      // nothing to tear down and no session object to remove it through. The
      // data is still on disk under the account's partition, which is how
      // `resetApp` reaches the same sessions.
      const accountSession = session.fromPartition(`persist:${selectedAccountId}`);

      await accountSession.clearData();

      await extensions.clearSessionData(accountSession);
    }

    const updatedAccounts = config
      .get("accounts")
      .filter((account) => account.id !== selectedAccountId);

    if (updatedAccounts.every((account) => account.selected === false)) {
      const nextSelectedAccount = updatedAccounts.find((account) => account.disabled !== true);

      if (nextSelectedAccount) {
        nextSelectedAccount.selected = true;
      } else {
        const [firstAccount] = updatedAccounts;

        if (!firstAccount) {
          throw new Error("Could not find first account");
        }

        // Settings keeps this out of reach by refusing to remove the last
        // enabled account, and every account left disabled leaves the app
        // nothing to run on, so one is turned back on here.
        firstAccount.disabled = false;

        firstAccount.selected = true;
      }
    }

    config.set("accounts", updatedAccounts);

    this.updateAllViewBounds();

    this.sendTabsChangedToRenderer();
  }

  updateAccount(accountDetails: AccountConfig) {
    // `disabled` is carried over from what is stored rather than from what came
    // in. The flag and the account instance behind it have to move together, so
    // `setAccountEnabled` is its only writer.
    config.set(
      "accounts",
      config
        .get("accounts")
        .map((account) =>
          account.id === accountDetails.id
            ? { ...account, ...accountDetails, disabled: account.disabled }
            : account,
        ),
    );
  }

  /**
   * Turns an account on or off in the running app, view and all, rather than
   * leaving it to the next launch.
   *
   * Enabling builds a fresh `Account`: a destroyed `Gmail` cannot be revived,
   * and the view it ran in left the window with it.
   */
  setAccountEnabled(accountId: AccountConfig["id"], enabled: boolean) {
    const accountConfigs = config.get("accounts");

    const accountConfig = accountConfigs.find((account) => account.id === accountId);

    if (!accountConfig || (accountConfig.disabled !== true) === enabled) {
      return;
    }

    // `config.get` hands back a copy, so the flag can be applied and the result
    // asked what would run before any of it is written back.
    accountConfig.disabled = !enabled;

    const launchableAccountConfigs = this.selectLaunchableAccountConfigs(accountConfigs);

    /*
     * Behind the switch settings already locks. What has to stay standing is
     * the list the app runs on rather than the enabled entries in the config:
     * the free version runs the first account alone, so turning that one off
     * leaves the app with nothing while the config still holds an enabled
     * account behind it.
     */
    if (launchableAccountConfigs.length === 0) {
      return;
    }

    if (enabled) {
      /*
       * The free version runs the first account alone, so turning one on
       * outside that slice moves the flag and nothing else. The launchable list
       * is what tells the two cases apart.
       */
      if (launchableAccountConfigs.some((account) => account.id === accountId)) {
        const instance = this.createAccountInstance(accountConfig);

        // A view is created visible and paints over renderer HTML, and the
        // settings page this is switched from is renderer HTML.
        if (main.location !== "/") {
          this.hide();
        }

        // As `createViews` does for an account at startup, so that the tabs
        // pinned to load on launch come up here too rather than staying
        // dormant until one is clicked.
        instance.tabs.loadLaunchTabs();
      }
    } else {
      this.teardownAccount(accountId);

      if (accountConfig.selected) {
        /*
         * Handed to an account that runs rather than to the next enabled one in
         * the config, which under the free version can be an account outside
         * the slice and so without an instance to select. Taken by id, because
         * the free version's list holds copies and writing to one of those
         * would leave the selection where it was.
         */
        const [nextSelectedAccountConfig] = launchableAccountConfigs;

        if (!nextSelectedAccountConfig) {
          throw new Error("Could not find next selected account");
        }

        for (const account of accountConfigs) {
          account.selected = account.id === nextSelectedAccountConfig.id;
        }
      }
    }

    // Written after `instances` either way, so that the `accounts` listeners
    // this fans out to see the config and the instances agreeing.
    config.set("accounts", accountConfigs);

    this.updateAllViewBounds();

    // As selecting an account does. Both directions leave the window's z-order
    // naming a view the titlebar does not: enabling puts the new one on top,
    // and tearing the selected one down drops the front view without saying
    // which of the rest takes its place.
    this.refreshSelectedAccountView();

    this.sendTabsChangedToRenderer();
  }

  hide() {
    this.setEmbeddedViewsVisible(false);
  }

  show() {
    this.setEmbeddedViewsVisible(true);
  }

  private setEmbeddedViewsVisible(visible: boolean) {
    for (const account of this.instances.values()) {
      for (const tab of account.tabs.tabs) {
        if (isWindowedTab(tab)) {
          continue;
        }

        tab.view?.setVisible(visible);
      }
    }
  }

  getTotalUnreadCount() {
    return Array.from(accounts.instances.values()).reduce((totalUnreadCount, instance) => {
      const unreadCount = instance.gmail.store.getState().unreadCount;

      return typeof unreadCount === "number" ? totalUnreadCount + unreadCount : totalUnreadCount;
    }, 0);
  }

  getFirstAccountWithUnread() {
    for (const accountConfig of this.getAccountConfigs()) {
      const instance = this.instances.get(accountConfig.id);

      if (instance) {
        const unreadCount = instance.gmail.store.getState().unreadCount;

        if (typeof unreadCount === "number" && unreadCount > 0) {
          return accountConfig;
        }
      }
    }
  }

  saveTabs() {
    if (main.isQuittingApp) {
      return;
    }

    // The free version restores no saved tabs, so its accounts hold none to
    // serialize — and writing that back would erase what the user pinned under
    // a license or a trial, on the quit after it ended.
    if (!licenseKey.isValid) {
      return;
    }

    config.set(
      "accounts",
      config.get("accounts").map((accountConfig) => {
        const instance = this.instances.get(accountConfig.id);

        if (!instance) {
          return accountConfig;
        }

        return {
          ...accountConfig,
          workspaceApps: {
            ...accountConfig.workspaceApps,
            savedTabs: instance.tabs.serializeSavedTabs(),
          },
        };
      }),
    );
  }

  sendTabsChangedToRenderer() {
    if (main.window.isDestroyed()) {
      return;
    }

    ipc.renderer.send(
      main.window.webContents,
      "tabs.changed",
      this.getAccounts().map((account) => ({
        accountId: account.config.id,
        tabs: account.instance.tabs.serialize(),
      })),
    );
  }

  sendAccountsChangedToRenderer() {
    if (main.window.isDestroyed()) {
      return;
    }

    ipc.renderer.send(
      main.window.webContents,
      "accounts.changed",
      this.getAccounts().map((account) => ({
        config: account.config,
        gmail: account.instance.gmail.store.getState(),
        verticalTabsWidth: account.instance.verticalTabsWidth,
      })),
    );
  }
}

export const accounts = new Accounts();
