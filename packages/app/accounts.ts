import { randomUUID } from "node:crypto";
import type { AccountConfig } from "@meru/shared/schemas";
import { Account } from "./account";
import { config } from "./config";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { appState } from "./state";
import { ipc } from "./ipc";

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
  }

  async createViews() {
    const accounts = this.getAccounts()
      .filter((account) => !account.instance.gmail.isAsleep)
      .sort((a, b) => {
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

    // When window is closed/minimized, the account views sometimes don't render after showing/restoring window
    main.window.on("show", () => {
      const selectedAccount = this.getSelectedAccount();

      if (selectedAccount.instance.gmail.isAsleep) {
        return;
      }

      main.window.contentView.removeChildView(selectedAccount.instance.gmail.view);
      main.window.contentView.addChildView(selectedAccount.instance.gmail.view);

      selectedAccount.instance.gmail.updateViewBounds();
      selectedAccount.instance.gmail.view.webContents.focus();

      if (selectedAccount.config.onDemand) {
        selectedAccount.instance.gmail.cancelSleep();
      }
    });

    main.window.on("restore", () => {
      const selectedAccount = this.getSelectedAccount();

      if (selectedAccount.instance.gmail.isAsleep) {
        return;
      }

      main.window.contentView.removeChildView(selectedAccount.instance.gmail.view);
      main.window.contentView.addChildView(selectedAccount.instance.gmail.view);

      selectedAccount.instance.gmail.updateViewBounds();
      selectedAccount.instance.gmail.view.webContents.focus();
    });

    main.window.on("focus", () => {
      const selectedAccount = this.getSelectedAccount();

      if (selectedAccount.config.onDemand && !selectedAccount.instance.gmail.isAsleep) {
        selectedAccount.instance.gmail.cancelSleep();
      }
    });

    main.window.on("blur", () => {
      this.scheduleSleepForOnDemandAccounts();
    });

    main.window.on("hide", () => {
      this.scheduleSleepForOnDemandAccounts();
    });
  }

  private scheduleSleepForOnDemandAccounts() {
    for (const account of this.getAccounts()) {
      if (account.config.onDemand && !account.instance.gmail.isAsleep) {
        account.instance.gmail.scheduleSleep();
      }
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

  async selectAccount(selectedAccountId: string) {
    const previouslySelectedAccount = this.getAccounts().find((account) => account.config.selected);

    config.set(
      "accounts",
      this.getAccountConfigs().map((accountConfig) => {
        return {
          ...accountConfig,
          selected: accountConfig.id === selectedAccountId,
        };
      }),
    );

    const selectedAccount = this.instances.get(selectedAccountId);

    if (!selectedAccount) {
      throw new Error("Could not find account to select");
    }

    if (selectedAccount.gmail.isAsleep) {
      await selectedAccount.gmail.wake();
    }

    selectedAccount.gmail.cancelSleep();

    main.window.contentView.removeChildView(selectedAccount.gmail.view);
    main.window.contentView.addChildView(selectedAccount.gmail.view);
    selectedAccount.gmail.updateViewBounds();
    selectedAccount.gmail.view.webContents.focus();

    if (
      previouslySelectedAccount &&
      previouslySelectedAccount.config.id !== selectedAccountId &&
      previouslySelectedAccount.config.onDemand &&
      !previouslySelectedAccount.instance.gmail.isAsleep
    ) {
      previouslySelectedAccount.instance.gmail.scheduleSleep();
    }

    return selectedAccount;
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
    accountDetails: Pick<AccountConfig, "label" | "notifications" | "color" | "onDemand"> & {
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
    };

    const instance = new Account(createdAccount);

    if (!createdAccount.onDemand) {
      instance.gmail.createView();
    }

    this.instances.set(createdAccount.id, instance);

    config.set("accounts", [...config.get("accounts"), createdAccount]);

    this.selectAccount(createdAccount.id);

    this.show();

    appState.setIsSettingsOpen(false);
  }

  async removeAccount(selectedAccountId: string) {
    const account = this.getAccount(selectedAccountId);

    account.instance.gmail.destroy();

    await account.instance.session.clearData();

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

    for (const account of this.instances.values()) {
      if (!account.gmail.isAsleep) {
        account.gmail.updateViewBounds();
      }
    }
  }

  updateAccount(accountDetails: AccountConfig) {
    const previousConfig = config
      .get("accounts")
      .find((account) => account.id === accountDetails.id);

    config.set(
      "accounts",
      config
        .get("accounts")
        .map((account) =>
          account.id === accountDetails.id ? { ...account, ...accountDetails } : account,
        ),
    );

    if (previousConfig && previousConfig.onDemand !== accountDetails.onDemand) {
      const instance = this.instances.get(accountDetails.id);

      if (instance) {
        if (accountDetails.onDemand) {
          if (!accountDetails.selected && !instance.gmail.isAsleep) {
            instance.gmail.sleep();
          }
        } else {
          if (instance.gmail.isAsleep) {
            instance.gmail.wake();
          }
        }
      }
    }
  }

  moveAccount(selectedAccountId: string, direction: "up" | "down") {
    const accountConfigs = config.get("accounts");

    const selectedAccountConfigIndex = accountConfigs.findIndex(
      (account) => account.id === selectedAccountId,
    );

    const selectedAccountConfig = accountConfigs.splice(selectedAccountConfigIndex, 1)[0];

    if (!selectedAccountConfig) {
      throw new Error("Could not find selected account config");
    }

    accountConfigs.splice(
      direction === "up"
        ? selectedAccountConfigIndex - 1
        : direction === "down"
          ? selectedAccountConfigIndex + 1
          : selectedAccountConfigIndex,
      0,
      selectedAccountConfig,
    );

    config.set("accounts", accountConfigs);
  }

  hide() {
    for (const account of this.instances.values()) {
      if (!account.gmail.isAsleep) {
        account.gmail.view.setVisible(false);
      }
    }
  }

  show() {
    for (const account of this.instances.values()) {
      if (!account.gmail.isAsleep) {
        account.gmail.view.setVisible(true);
      }
    }
  }

  getTotalUnreadCount() {
    return Array.from(accounts.instances.values()).reduce((totalUnreadCount, instance) => {
      if (instance.gmail.isAsleep) {
        return totalUnreadCount;
      }

      const unreadCount = instance.gmail.store.getState().unreadCount;

      return typeof unreadCount === "number" ? totalUnreadCount + unreadCount : totalUnreadCount;
    }, 0);
  }

  getFirstAccountWithUnread() {
    for (const accountConfig of this.getAccountConfigs()) {
      const instance = this.instances.get(accountConfig.id);

      if (instance && !instance.gmail.isAsleep) {
        const unreadCount = instance.gmail.store.getState().unreadCount;

        if (typeof unreadCount === "number" && unreadCount > 0) {
          return accountConfig;
        }
      }
    }
  }

  sendAccountsChangedToRenderer() {
    ipc.renderer.send(
      main.window.webContents,
      "accounts.changed",
      this.getAccounts().map((account) => ({
        config: account.config,
        gmail: {
          ...account.instance.gmail.store.getState(),
          ...account.instance.gmail.viewStore.getState(),
        },
      })),
    );
  }
}

export const accounts = new Accounts();
