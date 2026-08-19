import { randomUUID } from "node:crypto";
import { platform } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import type { AccountConfig } from "@meru/shared/schemas";
import {
  getVerticalTabsWidth,
  getVisibleVerticalTabs,
  type VerticalTabsSessionWidth,
} from "@meru/shared/tabs";
import { Account } from "./account";
import { config } from "./config";
import { extensions } from "./extensions";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { isWindowedTab } from "./tabs";
import { WorkspaceApp } from "./workspace-app";

const HIBERNATION_SWEEP_INTERVAL = ms("1m");

class Accounts {
  instances: Map<string, Account> = new Map();

  init() {
    let accountConfigs = config.get("accounts");

    if (!licenseKey.isValid && accountConfigs.length > 1 && accountConfigs[0]?.selected === false) {
      for (const [index, accountConfig] of accountConfigs.entries()) {
        accountConfig.selected = index === 0;
      }

      config.set("accounts", accountConfigs);
    }

    for (const accountConfig of this.getAccountConfigs()) {
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
  }

  async createViews() {
    const accounts = this.getAccounts().toSorted((a, b) => {
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

  getAccountConfigs() {
    const accountConfigs = config.get("accounts");

    if (!licenseKey.isValid) {
      return accountConfigs.slice(0, 1);
    }

    return accountConfigs;
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
    config.set(
      "accounts",
      this.getAccountConfigs().map((accountConfig) => {
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

    const instance = new Account(createdAccount);

    instance.gmail.createView();

    this.instances.set(createdAccount.id, instance);

    config.set("accounts", [...config.get("accounts"), createdAccount]);

    this.selectAccount(createdAccount.id);

    this.sendTabsChangedToRenderer();

    main.navigate("/");
  }

  async removeAccount(selectedAccountId: string) {
    const account = this.getAccount(selectedAccountId);

    account.instance.tabs.closeAll();

    WorkspaceApp.closeAccountInstances(selectedAccountId);

    account.instance.gmail.destroy();

    account.instance.destroy();

    await account.instance.session.clearData();

    await extensions.clearSessionData(account.instance.session);

    this.instances.delete(selectedAccountId);

    const updatedAccounts = config
      .get("accounts")
      .filter((account) => account.id !== selectedAccountId);

    if (updatedAccounts.every((account) => account.selected === false)) {
      if (!updatedAccounts[0]) {
        throw new Error("Could not find first account");
      }

      updatedAccounts[0].selected = true;
    }

    config.set("accounts", updatedAccounts);

    this.updateAllViewBounds();

    this.sendTabsChangedToRenderer();
  }

  updateAccount(accountDetails: AccountConfig) {
    config.set(
      "accounts",
      config
        .get("accounts")
        .map((account) =>
          account.id === accountDetails.id ? { ...account, ...accountDetails } : account,
        ),
    );
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

    config.set(
      "accounts",
      this.getAccountConfigs().map((accountConfig) => {
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
